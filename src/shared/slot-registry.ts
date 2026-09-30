import { ALL_TASKS, TASK_LABELS, type Task } from './task-prompts';
import type { PromptTemplate } from './types';

export interface SlotSpec {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly source: 'request' | 'preset' | 'context' | 'instruction' | 'user';
  readonly example: string;
  readonly filledFor: readonly Task[];
}

const ALL = ALL_TASKS;

export const SLOT_REGISTRY: Readonly<Record<string, SlotSpec>> = Object.freeze({
  text: {
    name: 'text',
    description: 'The source text the user selected. Required.',
    required: true,
    source: 'request',
    example: 'mar7aba, kifak?',
    filledFor: ALL,
  },
  langLabel: {
    name: 'langLabel',
    description: 'Source-variety label, e.g. "Arabizi".',
    required: false,
    source: 'preset',
    example: 'Arabizi',
    filledFor: ALL,
  },
  langHint: {
    name: 'langHint',
    description: 'Hint paragraph from the preset, sets translation context.',
    required: false,
    source: 'preset',
    example: 'Latinised Arabic. Numerals stand in for Arabic letters …',
    filledFor: ALL,
  },
  targetLangLabel: {
    name: 'targetLangLabel',
    description: 'Target-language label, e.g. "English".',
    required: false,
    source: 'request',
    example: 'English',
    filledFor: ALL,
  },
  targetLangHint: {
    name: 'targetLangHint',
    description: 'Hint paragraph from the target preset, sets output-variety context.',
    required: false,
    source: 'preset',
    example: 'Latinised Arabic. Numerals stand in for Arabic letters …',
    filledFor: ALL,
  },
  examples: {
    name: 'examples',
    description: 'Few-shot examples block from the preset (optional).',
    required: false,
    source: 'preset',
    example: 'EXAMPLES:\n- mar7aba → Hello',
    filledFor: ALL,
  },
  context: {
    name: 'context',
    description: 'PAGE CONTEXT block — title, URL, surrounding text.',
    required: false,
    source: 'context',
    example: 'PAGE CONTEXT:\nTitle: …',
    filledFor: ALL,
  },
  explainInstr: {
    name: 'explainInstr',
    description: 'Cultural-subtext analyst instructions (only when explain mode).',
    required: false,
    source: 'instruction',
    example: '<role>You are a cultural-subtext analyst …',
    filledFor: ['explain'],
  },
  detectiveInstr: {
    name: 'detectiveInstr',
    description: 'Detection instructions (auto mode adds candidates).',
    required: false,
    source: 'instruction',
    example: 'Detect which informal language …',
    filledFor: ['translate', 'explain'],
  },
  explainField: {
    name: 'explainField',
    description: 'JSON schema fragment adding explain field (only when explain).',
    required: false,
    source: 'instruction',
    example: ', "explain": string',
    filledFor: ['explain'],
  },
  tone: {
    name: 'tone',
    description: 'Reword tone (formal / casual / neutral / polite / blunt).',
    required: false,
    source: 'instruction',
    example: 'formal and professional — full sentences …',
    filledFor: ['reword'],
  },
});

export function slotsForTask(task: Task): readonly SlotSpec[] {
  return Object.values(SLOT_REGISTRY).filter((s) => s.filledFor.includes(task));
}

/** Every registered slot. The global template spans all tasks, so its palette
 *  must offer slots no single task fills — `explainInstr`, `explainField`. */
export function allSlots(): readonly SlotSpec[] {
  return Object.values(SLOT_REGISTRY);
}

export function isBuiltInSlot(name: string): boolean {
  return Object.hasOwn(SLOT_REGISTRY, name);
}

export function requiredMissingSlots(task: Task, userTemplate: string): readonly string[] {
  return Object.values(SLOT_REGISTRY)
    .filter(
      (s) => s.required && s.filledFor.includes(task) && !userTemplate.includes(`{{${s.name}}}`),
    )
    .map((s) => s.name);
}

export interface SlotValidationResult {
  ok: boolean;
  errors: { message: string; slot?: string }[];
  warnings: { message: string; slot?: string }[];
}

export const SLOT_RE = /\{\{(\w+)\}\}/g;

export function validateAgainstSlots(template: PromptTemplate, task: Task): SlotValidationResult {
  const errors: SlotValidationResult['errors'] = [];
  const warnings: SlotValidationResult['warnings'] = [];

  for (const name of requiredMissingSlots(task, template.user)) {
    errors.push({
      message: `The user template must include {{${name}}} — it marks where the selected text goes. Add it with Insert variable.`,
      slot: name,
    });
  }

  const seen = new Set<string>();
  const taskSlots = new Set(slotsForTask(task).map((s) => s.name));
  for (const text of [template.system, template.user]) {
    for (const m of text.matchAll(SLOT_RE)) {
      const name = m[1] ?? '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (!isBuiltInSlot(name)) {
        warnings.push({
          message: `Unknown variable {{${name}}}`,
          slot: name,
        });
        continue;
      }
      if (!taskSlots.has(name)) {
        warnings.push({
          message: `{{${name}}} is not available for the ${TASK_LABELS[task]} task`,
          slot: name,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function extractCustomSlots(template: PromptTemplate): readonly string[] {
  const out = new Set<string>();
  for (const text of [template.system, template.user]) {
    for (const m of text.matchAll(SLOT_RE)) {
      const name = m[1] ?? '';
      if (name && !isBuiltInSlot(name)) out.add(name);
    }
  }
  return [...out];
}
