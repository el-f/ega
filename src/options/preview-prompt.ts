import { buildTaskPrompt } from '@/shared/prompts';
import { filterGlossaryForRequest, renderGlossaryBlock } from '@/shared/glossary';
import { filterRulesForRequest, renderRulesBlock } from '@/shared/rules';
import { clampRulesToBudget, RULES_BLOCK_WARN_BYTES } from '@/shared/rules-budget';
import { builtInTaskView } from '@/shared/task-view';
import { autoCandidates, varietyToPreset } from '@/shared/varieties';
import { answerFormatFor } from '@/shared/task-template';
import { customAnswerContract } from '@/shared/answer/custom';
import { type Task } from '@/shared/task-prompts';
import type { CustomTaskInput } from '@/shared/tasks';
import type {
  LangPreset,
  LangSelection,
  PromptTemplate,
  Settings,
  TranslationRequest,
  Variety,
} from '@/shared/types';

export const PREVIEW_SAMPLE_TEXT = 'Hello world (sample text for preview).';

export interface PreviewInput {
  task: Task;
  explain: boolean;
  template: PromptTemplate;
  text: string;
  sourceLang: LangSelection;
  targetLang: LangSelection;
  /** Every language, on or off, as `listVarieties` returns them. */
  varieties: readonly Variety[];
}

/** The custom-task editor's draft: its switches and contract replace a built-in's. */
export interface CustomPreviewInput extends Omit<PreviewInput, 'task' | 'explain' | 'template'> {
  id: string;
  row: CustomTaskInput;
}

export function buildCustomPreviewPrompt(
  s: Settings,
  input: CustomPreviewInput,
): { system: string; user: string } {
  const { row } = input;
  const auto = input.sourceLang === 'auto';
  const presetFor = (id: LangSelection): LangPreset | undefined => {
    const v = input.varieties.find((x) => x.id === String(id));
    return v ? varietyToPreset(v) : undefined;
  };
  const targetPreset = presetFor(input.targetLang);
  const preset = auto ? undefined : presetFor(input.sourceLang);
  const glossary = row.glossary
    ? filterGlossaryForRequest(s.glossary, {
        text: input.text,
        sourceLang: String(input.sourceLang),
        targetLang: String(input.targetLang),
      })
    : [];
  return buildTaskPrompt({
    req: {
      id: 'preview',
      text: input.text,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      options: { stream: false, explain: false, task: input.id },
    },
    build: {
      preset,
      ...(targetPreset ? { targetPreset } : {}),
      template: { system: row.system, user: row.user },
      ...(auto ? { candidates: autoCandidates(input.varieties.filter((v) => !v.disabled)) } : {}),
      tone: s.defaultTone,
      snippets: {},
    },
    glossaryBlock: renderGlossaryBlock(glossary),
    rulesBlock: renderRulesBlock(
      clampRulesToBudget(
        filterRulesForRequest(s.advanced.rules, input.id, undefined),
        RULES_BLOCK_WARN_BYTES,
      ),
    ),
    contract: customAnswerContract(row, input.id),
  });
}

/** The prompt the router builds for this task and template, from a sample request with no page and no site, so no page context. */
export function buildPreviewPrompt(
  s: Settings,
  input: PreviewInput,
): { system: string; user: string } {
  // An Explain request carries the explain task, so its switches and rules apply.
  const task: Task = input.explain && input.task === 'translate' ? 'explain' : input.task;
  const view = builtInTaskView(s, task);
  const presetFor = (id: LangSelection): LangPreset | undefined => {
    const v = input.varieties.find((x) => x.id === String(id));
    return v ? varietyToPreset(v) : undefined;
  };
  const auto = input.sourceLang === 'auto';
  const preset = auto ? undefined : presetFor(input.sourceLang);
  const targetPreset = presetFor(input.targetLang);
  const req: TranslationRequest = {
    id: 'preview',
    text: input.text,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    options: { stream: false, explain: input.explain, task: input.task },
  };
  const glossary = view.glossary
    ? filterGlossaryForRequest(s.glossary, {
        text: input.text,
        sourceLang: String(input.sourceLang),
        targetLang: String(input.targetLang),
      })
    : [];
  const rules = clampRulesToBudget(
    filterRulesForRequest(s.advanced.rules, task, undefined),
    RULES_BLOCK_WARN_BYTES,
  );
  return buildTaskPrompt({
    req,
    build: {
      preset,
      ...(targetPreset ? { targetPreset } : {}),
      template: input.template,
      ...(auto ? { candidates: autoCandidates(input.varieties.filter((v) => !v.disabled)) } : {}),
      tone: s.defaultTone,
      snippets: s.advanced.snippets,
    },
    glossaryBlock: renderGlossaryBlock(glossary),
    rulesBlock: renderRulesBlock(rules),
    format: answerFormatFor(task),
  });
}
