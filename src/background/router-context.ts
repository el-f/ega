import type {
  CustomLanguage,
  LangPreset,
  PageContext,
  PromptTemplate,
  Settings,
  TranslationChunk,
  TranslationRequest,
  Variety,
} from '@/shared/types';
import type { BackendConfig } from '@/shared/backends/base';
import type { Logger } from '@/shared/logger';
import { buildBackendConfig } from '@/shared/backends/build-config';
import { DEFAULT_STREAMING_FLUSH_MS } from '@/shared/constants';
import { buildPrompt, composeSystemPrefix } from '@/shared/prompts';
import { labelFor } from '@/shared/languages';
import { redactContext } from '@/shared/redact';
import { buildTaskTemplate, type Task } from '@/shared/task-prompts';
import { filterRulesForRequest, renderRulesBlock } from '@/shared/rules';
import { clampRulesToBudget, RULES_BLOCK_WARN_BYTES } from '@/shared/rules-budget';
import {
  filterGlossaryForRequest,
  renderGlossaryBlock,
  type GlossaryEntry,
} from '@/shared/glossary';
import { glossaryDigest } from '@/shared/glossary-digest';
import { sha256Hex } from '@/shared/sha256';
import { materializeVarieties, findVarietyRaw } from '@/shared/varieties';
import { normaliseExplainRouting } from './explain-routing';
import { cacheKey } from './cache';
import { wrapOnChunkForStreamingFlush } from './router-chunks';

function hostFromUrl(req: TranslationRequest): string | undefined {
  if (req.pageHost) return req.pageHost;
  const url = req.context?.pageUrl;
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function pickTemplate(s: Settings, langId: string): PromptTemplate {
  // Object.hasOwn guards against prototype-key collisions (e.g. preset id
  // 'toString'): plain `[]` access would return the inherited function.
  return Object.hasOwn(s.advanced.perPresetTemplates, langId)
    ? (s.advanced.perPresetTemplates[langId] ?? s.advanced.promptTemplate)
    : s.advanced.promptTemplate;
}

/** Label a prompt should use for a target id: the variety's own label when the id names
 *  one, else the ISO name. Never the bare id — "en" reads as a code to the model. */
export function targetLabelFor(s: Settings, customs: CustomLanguage[], id: string): string {
  return findVarietyRaw(s, customs, id)?.label ?? labelFor(id);
}

function varietyToPreset(v: Variety): LangPreset {
  return {
    id: v.id,
    label: v.label,
    hint: v.hint,
    examples: v.examples,
    ...(v.autoDetect ? { autoDetect: v.autoDetect } : {}),
  };
}

export interface TranslateCtx {
  s: Settings;
  customs: CustomLanguage[];
  cfg: BackendConfig;
  translateTimeoutMs: number;
  onChunk: (c: TranslationChunk) => void;
  langIdStr: string;
  preset: LangPreset | undefined;
  targetPreset: LangPreset | undefined;
  requestedTask: Task;
  reqOptions: TranslationRequest['options'];
  reqView: TranslationRequest;
  tpl: PromptTemplate;
  key: string;
  /** Filtered once in resolveTranslateContext and reused by buildSystemAndUser. */
  glossaryEntries: readonly GlossaryEntry[];
  /** Host- and task-scoped, so it goes into the cache key as well as the system prompt. Empty when no rule applies. */
  rulesBlock: string;
}

export interface ContextDeps {
  getSettings: () => Promise<Settings>;
  getCustomLanguages?: () => Promise<CustomLanguage[]>;
  logger: Logger;
  /** Used when the settings carry no per-request translate budget. */
  fallbackTranslateTimeoutMs: number;
}

/** Turns one request plus the current settings into everything downstream
 *  needs: the prompt inputs, the wall-clock budget, and the cache key. */
export function createContextResolver(deps: ContextDeps) {
  return async function resolveTranslateContext(
    req: TranslationRequest,
    onChunkRaw: (c: TranslationChunk) => void,
  ): Promise<TranslateCtx> {
    const customsPromise = deps.getCustomLanguages
      ? deps.getCustomLanguages().catch((e) => {
          deps.logger.warn('getCustomLanguages failed', e);
          return [] as CustomLanguage[];
        })
      : Promise.resolve<CustomLanguage[]>([]);
    const [s, customs] = await Promise.all([deps.getSettings(), customsPromise]);
    const cfg = buildBackendConfig(s, req.options.task);
    const translateTimeoutMs = s.translateTimeoutMs ?? deps.fallbackTranslateTimeoutMs;
    const onChunk = wrapOnChunkForStreamingFlush(
      onChunkRaw,
      s.streamingFlushMs ?? DEFAULT_STREAMING_FLUSH_MS,
    );
    const langIdStr = String(req.sourceLang);

    let preset: LangPreset | undefined;
    if (typeof req.sourceLang === 'string' && req.sourceLang !== 'auto') {
      const v = findVarietyRaw(s, customs, req.sourceLang);
      if (v) preset = varietyToPreset(v);
    }
    let targetPreset: LangPreset | undefined;
    if (typeof req.targetLang === 'string' && req.targetLang.length > 0) {
      const tv = findVarietyRaw(s, customs, req.targetLang);
      if (tv) targetPreset = varietyToPreset(tv);
    }

    // normaliseExplainRouting rewrites explain to translate for the prompt and cache, but routing still pins on the user's task.
    const requestedTask = req.options.task ?? 'translate';
    const { task, options: reqOptions } = normaliseExplainRouting(req.options);
    // Page context is scrubbed with no toggle; the translate body is never touched, because redacting it corrupts the output.
    const redactCtxOn = req.context !== undefined;
    const reqView: TranslationRequest = {
      ...req,
      options: reqOptions,
      ...(redactCtxOn ? { context: redactContext(req.context as PageContext) } : {}),
    };
    const taskTemplateUserOverride =
      task !== 'translate' ? s.advanced.taskTemplates[task] : undefined;
    const taskTemplate =
      task !== 'translate'
        ? (taskTemplateUserOverride ?? buildTaskTemplate(task, reqOptions.tone))
        : undefined;
    const tpl = taskTemplate ?? pickTemplate(s, langIdStr);

    // grammar / reword / summarize are told never to translate, so forced translations contradict their own prompt.
    const glossaryApplies = requestedTask === 'translate' || requestedTask === 'explain';
    const glossaryEntries = glossaryApplies
      ? filterGlossaryForRequest(s.glossary, {
          text: req.text,
          sourceLang: String(req.sourceLang),
          targetLang: String(req.targetLang),
        })
      : [];
    const gDigest = await glossaryDigest(glossaryEntries);
    const applicableRules = filterRulesForRequest(
      s.advanced.rules,
      requestedTask,
      hostFromUrl(req),
    );
    const keptRules = clampRulesToBudget(applicableRules, RULES_BLOCK_WARN_BYTES);
    if (keptRules.length < applicableRules.length) {
      deps.logger.warn(
        `rules block over ${RULES_BLOCK_WARN_BYTES} bytes: dropped the ${applicableRules.length - keptRules.length} least specific rule(s)`,
      );
    }
    const rulesBlock = renderRulesBlock(keptRules);
    const rDigest = rulesBlock ? await sha256Hex(rulesBlock) : undefined;
    // Hash what the prompt renders — the redacted view — so two contexts that scrub to the same block share a slot.
    const cDigest = reqView.context ? await sha256Hex(JSON.stringify(reqView.context)) : undefined;
    const history = req.options.conversationHistory;
    const hDigest = history?.length
      ? await sha256Hex(history.map((h) => h.role + ':' + h.content).join('\x1f'))
      : undefined;
    const key = await cacheKey({
      text: req.text,
      langId: langIdStr,
      targetLang: req.targetLang,
      task: requestedTask,
      ...(cDigest ? { contextDigest: cDigest } : {}),
      ...(reqOptions.explain ? { explain: true } : {}),
      ...(reqOptions.tone ? { tone: reqOptions.tone } : {}),
      ...(req.options.refinement ? { refinement: req.options.refinement } : {}),
      ...(gDigest ? { glossaryDigest: gDigest } : {}),
      ...(hDigest ? { historyDigest: hDigest } : {}),
      ...(rDigest ? { rulesDigest: rDigest } : {}),
    });
    return {
      s,
      customs,
      cfg,
      translateTimeoutMs,
      onChunk,
      langIdStr,
      preset,
      targetPreset,
      requestedTask,
      reqOptions,
      reqView,
      tpl,
      key,
      glossaryEntries,
      rulesBlock,
    };
  };
}

export function buildSystemAndUser(
  ctx: TranslateCtx,
  req: TranslationRequest,
): { system: string; user: string } {
  let candidates: LangPreset[] | undefined;
  if (ctx.langIdStr === 'auto') {
    const vs = materializeVarieties(ctx.s, ctx.customs, { enabledOnly: true });
    // Customs lead: renderCandidates keeps only the first 12, and a user-authored language the shipped list would push out is the one they care about.
    candidates = [
      ...vs.filter((v) => v.kind === 'custom'),
      ...vs.filter((v) => v.kind !== 'custom'),
    ].map(varietyToPreset);
  }
  const resolvedTone =
    ctx.requestedTask === 'reword'
      ? (ctx.reqOptions.tone ?? ctx.s.advanced.taskTones['reword'] ?? ctx.s.defaultTone)
      : undefined;
  const built = buildPrompt(ctx.reqView, {
    preset: ctx.preset,
    ...(ctx.targetPreset ? { targetPreset: ctx.targetPreset } : {}),
    template: ctx.tpl,
    ...(candidates ? { candidates } : {}),
    ...(ctx.s.descriptionContextCap !== undefined
      ? { descriptionContextCap: ctx.s.descriptionContextCap }
      : {}),
    ...(resolvedTone ? { tone: resolvedTone } : {}),
    snippets: ctx.s.advanced.snippets,
  });
  const glossaryBlock = renderGlossaryBlock(ctx.glossaryEntries);
  const refinement = req.options.refinement?.trim();
  const refineBlock = refinement ? `Refinement for this response: ${refinement}` : '';
  return {
    system: composeSystemPrefix(glossaryBlock, ctx.rulesBlock, built.system),
    user: refineBlock ? refineBlock + '\n' + built.user : built.user,
  };
}
