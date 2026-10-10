import type {
  CustomLanguage,
  LangPreset,
  PageContext,
  PromptTemplate,
  Settings,
  TranslationChunk,
  TranslationRequest,
} from '@/shared/types';
import type { BackendConfig } from '@/shared/backends/base';
import type { Logger } from '@/shared/logger';
import { buildBackendConfig } from '@/shared/backends/build-config';
import { DEFAULT_STREAMING_FLUSH_MS } from '@/shared/constants';
import { buildTaskPrompt, readsPageContext } from '@/shared/prompts';
import { CARD_CONTRACT, PLAIN_CONTRACT } from '@/shared/answer/formats-v1';
import { labelFor } from '@/shared/languages';
import { redactContext } from '@/shared/redact';
import { answerFormatFor } from '@/shared/task-template';
import { builtInTask, type Task, type Tone } from '@/shared/task-prompts';
import { type AnswerFormat } from '@/shared/answer/formats-v1';
import {
  BUILT_IN_TASK_SWITCHES,
  builtInTaskView,
  findTask,
  type TaskId,
  type TaskView,
} from '@/shared/task-view';
import { ownTaskPrompt } from '@/shared/task-template';
import type { CustomTask } from '@/shared/settings-schema';
import { languagePrompt } from '@/shared/language-prompt';
import { filterRulesForRequest, renderRulesBlock } from '@/shared/rules';
import { clampRulesToBudget, RULES_BLOCK_WARN_BYTES } from '@/shared/rules-budget';
import {
  filterGlossaryForRequest,
  renderGlossaryBlock,
  type GlossaryEntry,
} from '@/shared/glossary';
import {
  autoCandidates,
  materializeVarieties,
  findVarietyRaw,
  varietyToPreset,
} from '@/shared/varieties';
import { normaliseExplainRouting } from './explain-routing';
import { cacheKey } from './cache';
import { wrapOnChunkForStreamingFlush } from './router-chunks';
import { answerSpecFor, CUSTOM_PRESETS, type AnswerSpec } from '@/shared/answer/spec';

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

/** Label a prompt should use for a target id: the variety's own label when the id names
 *  one, else the ISO name. Never the bare id — "en" reads as a code to the model. */
export function targetLabelFor(s: Settings, customs: CustomLanguage[], id: string): string {
  return findVarietyRaw(s, customs, id)?.label ?? labelFor(id);
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
  /** The task id as asked for: a built-in or a custom task's id. */
  requestedTask: TaskId;
  reqOptions: TranslationRequest['options'];
  reqView: TranslationRequest;
  tpl: PromptTemplate;
  /** The request's tone, else the default; fills {{tone}} in any template that has it. */
  tone: Tone;
  /** The task as the user set it up: which inputs it takes. */
  view: TaskView;
  answerSpec: AnswerSpec;
  contextBlockIfNoSlot: boolean;
  /** A custom task's answer contract. */
  contract?: string;
  /** A built-in's answer format, joined on when its prompt holds none. */
  format?: AnswerFormat;
  /** Snippets the template expands: none for a custom task. */
  snippets: Record<string, string>;
  /** The text-path prompt; the cache key is its hash, so a new modifier cannot miss the key. */
  prompt: { system: string; user: string };
  key: string;
  /** Filtered once in resolveTranslateContext and reused by buildSystemAndUser. */
  glossaryEntries: readonly GlossaryEntry[];
  /** Host- and task-scoped; it reaches the system prompt, and through it the cache key. Empty when no rule applies. */
  rulesBlock: string;
}

export interface ContextDeps {
  getSettings: () => Promise<Settings>;
  getCustomLanguages?: () => Promise<CustomLanguage[]>;
  getCustomTasks?: () => Promise<CustomTask[]>;
  logger: Logger;
  /** Used when the settings carry no per-request translate budget. */
  fallbackTranslateTimeoutMs: number;
}

/** The request names a task no built-in or custom row has: a deleted custom task, or a hand-made message. */
export class UnknownTaskError extends Error {}
export class DisabledTaskError extends Error {}

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
    const requestedTask: TaskId = req.options.task ?? 'translate';
    // Only a custom id reads the rows, so a failed read cannot fail a built-in request; for a custom id it fails closed.
    const [s, customs, customTasks] = await Promise.all([
      deps.getSettings(),
      customsPromise,
      builtInTask(requestedTask) === null
        ? (deps.getCustomTasks?.() ?? Promise.resolve<CustomTask[]>([]))
        : Promise.resolve<CustomTask[]>([]),
    ]);
    const custom = customTasks.find((c) => c.id === requestedTask);
    if (custom === undefined && builtInTask(requestedTask) === null) throw new UnknownTaskError();
    const builtIn: Task = builtInTask(requestedTask) ?? 'translate';
    const view = findTask(s, customTasks, requestedTask) ?? builtInTaskView(s, builtIn);
    if (view.disabled) throw new DisabledTaskError();
    const cfg = buildBackendConfig(s, custom ? undefined : builtIn, custom?.effort);
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

    // normaliseExplainRouting rewrites explain to translate for the prompt; rules, glossary, audit and the cache key read the user's task.
    const { task, options: reqOptions } = normaliseExplainRouting(req.options);
    // A task that does not take page context drops it here, so it neither renders nor splits the cache.
    const { context: sentContext, ...reqNoContext } = req;
    // Page context is scrubbed with no toggle; the translate body is never touched, because redacting it corrupts the output.
    const reqView: TranslationRequest = {
      ...reqNoContext,
      options: reqOptions,
      ...(sentContext !== undefined && view.pageContext
        ? { context: redactContext(sentContext as PageContext) }
        : {}),
    };
    const tpl = custom
      ? { system: custom.system, user: custom.user }
      : task !== 'translate'
        ? ownTaskPrompt(s, task)
        : languagePrompt(s, langIdStr);
    // Custom prompts never expand snippets.
    const snippets = custom ? {} : s.advanced.snippets;
    const tone = reqOptions.tone ?? s.defaultTone;

    const glossaryEntries = view.glossary
      ? filterGlossaryForRequest(s.glossary, {
          text: req.text,
          sourceLang: String(req.sourceLang),
          targetLang: String(req.targetLang),
        })
      : [];
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
    const inputs: PromptInputs = {
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
      tone,
      view,
      answerSpec: custom
        ? CUSTOM_PRESETS[custom.output === 'card' ? 'answer-notes' : 'answer-only']
        : answerSpecFor(task),
      // A built-in shipped without page context has no slot for it, so a user who turned it on gets a context block.
      contextBlockIfNoSlot:
        view.pageContext && (custom !== undefined || !BUILT_IN_TASK_SWITCHES[task].pageContext),
      ...(custom
        ? { contract: custom.output === 'card' ? CARD_CONTRACT : PLAIN_CONTRACT }
        : { format: answerFormatFor(task) }),
      snippets,
      glossaryEntries,
      rulesBlock,
    };
    // The key hashes the prompt itself, so it can never disagree with what the model is sent.
    const prompt = buildSystemAndUser(inputs, req);
    const history = req.options.conversationHistory;
    const key = await cacheKey({
      ...prompt,
      task: requestedTask,
      ...(history?.length ? { history } : {}),
    });
    return { ...inputs, prompt, key };
  };
}

/** Everything the prompt is built from: the context without the prompt and the key derived from it. */
type PromptInputs = Omit<TranslateCtx, 'prompt' | 'key'>;

/** Page info reaches the model only when the request kept it and the prompt renders it: a {{context}} slot, or the block a slotless task gets. */
export function rendersPageContext(ctx: PromptInputs): boolean {
  return (
    ctx.reqView.context !== undefined &&
    (ctx.contextBlockIfNoSlot || readsPageContext(ctx.tpl, ctx.snippets))
  );
}

export function buildSystemAndUser(
  ctx: PromptInputs,
  req: TranslationRequest,
): { system: string; user: string } {
  const candidates =
    ctx.langIdStr === 'auto'
      ? autoCandidates(materializeVarieties(ctx.s, ctx.customs, { enabledOnly: true }))
      : undefined;
  return buildTaskPrompt({
    req: ctx.reqView,
    build: {
      preset: ctx.preset,
      ...(ctx.targetPreset ? { targetPreset: ctx.targetPreset } : {}),
      template: ctx.tpl,
      ...(candidates ? { candidates } : {}),
      ...(ctx.s.descriptionContextCap !== undefined
        ? { descriptionContextCap: ctx.s.descriptionContextCap }
        : {}),
      tone: ctx.tone,
      snippets: ctx.snippets,
    },
    glossaryBlock: renderGlossaryBlock(ctx.glossaryEntries),
    rulesBlock: ctx.rulesBlock,
    ...(req.options.refinement !== undefined ? { refinement: req.options.refinement } : {}),
    contextBlockIfNoSlot: ctx.contextBlockIfNoSlot,
    ...(ctx.contract ? { contract: ctx.contract } : {}),
    ...(ctx.format ? { format: ctx.format } : {}),
  });
}
