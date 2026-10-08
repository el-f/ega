import { ALL_TASKS, TASK_LABELS, builtInTask, type Task } from './task-prompts';
import type { PromptTemplate } from './types';
import { SLOT_RE } from './snippets';

export interface SlotSpec {
  readonly name: string;
  /** Plain name shown in the editor's variable list. */
  readonly label: string;
  /** What it fills in, in plain words; UI copy. */
  readonly meaning: string;
  /** False for a slot that belongs to the answer format, not to the editable prompt. */
  readonly offered: boolean;
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
    label: 'Selected text',
    meaning: 'The text you selected; the message must contain it',
    offered: true,
    description: 'The source text the user selected. Required.',
    required: true,
    source: 'request',
    example: 'mar7aba, kifak?',
    filledFor: ALL,
  },
  langLabel: {
    name: 'langLabel',
    label: 'Source language',
    meaning: 'Name of the language of the text, for example Arabizi',
    offered: true,
    description: 'Source-variety label, e.g. "Arabizi".',
    required: false,
    source: 'preset',
    example: 'Arabizi',
    filledFor: ALL,
  },
  langHint: {
    name: 'langHint',
    label: 'Source language notes',
    meaning: 'The notes written for the source language',
    offered: true,
    description: 'Hint paragraph from the preset, sets translation context.',
    required: false,
    source: 'preset',
    example: 'Latinized Arabic. Numerals stand in for Arabic letters …',
    filledFor: ALL,
  },
  targetLangLabel: {
    name: 'targetLangLabel',
    label: 'Target language',
    meaning: 'Name of the language to answer in, for example English',
    offered: true,
    description: 'Target-language label, e.g. "English".',
    required: false,
    source: 'request',
    example: 'English',
    filledFor: ALL,
  },
  targetLangHint: {
    name: 'targetLangHint',
    label: 'Target language notes',
    meaning: 'The notes written for the target language',
    offered: true,
    description: 'Hint paragraph from the target preset, sets output-variety context.',
    required: false,
    source: 'preset',
    example: 'Latinized Arabic. Numerals stand in for Arabic letters …',
    filledFor: ALL,
  },
  examples: {
    name: 'examples',
    label: 'Examples',
    meaning: 'Example pairs from the source language',
    offered: true,
    description: 'Few-shot examples block from the preset (optional).',
    required: false,
    source: 'preset',
    example: 'EXAMPLES:\n- mar7aba → Hello',
    filledFor: ALL,
  },
  context: {
    name: 'context',
    label: 'Page context',
    meaning: 'Page title, address and nearby text; empty unless Send page context is on',
    offered: true,
    description: 'PAGE CONTEXT block — title, URL, surrounding text.',
    required: false,
    source: 'context',
    example: 'PAGE CONTEXT:\nTitle: …',
    filledFor: ALL,
  },
  explainInstr: {
    name: 'explainInstr',
    label: 'Explain instructions',
    meaning: 'How to write the Explain notes; filled only when Explain runs',
    offered: true,
    description: 'Cultural-subtext analyst instructions (only when explain mode).',
    required: false,
    source: 'instruction',
    example: '<role>You are a cultural-subtext analyst …',
    filledFor: ['explain'],
  },
  detectiveInstr: {
    name: 'detectiveInstr',
    label: 'Language detection',
    meaning: 'Asks the model to name the language it sees',
    offered: true,
    description: 'Detection instructions (auto mode adds candidates).',
    required: false,
    source: 'instruction',
    example: 'Detect which informal language …',
    // buildPrompt fills it for every prompt, a custom task's included.
    filledFor: ALL,
  },
  explainField: {
    name: 'explainField',
    label: 'Explain field',
    meaning: 'Part of the answer format; filled only when Explain runs',
    offered: false,
    description: 'JSON schema fragment adding explain field (only when explain).',
    required: false,
    source: 'instruction',
    example: ', "explain": string',
    filledFor: ['explain'],
  },
  tone: {
    name: 'tone',
    label: 'Tone',
    meaning: 'The tone picked for the request, else the default tone',
    offered: true,
    description:
      'The tone picked for the request, else the default tone (formal / casual / neutral / polite / blunt).',
    required: false,
    source: 'instruction',
    example: 'formal and professional — full sentences …',
    filledFor: ALL,
  },
});

export function slotsForTask(task: Task): readonly SlotSpec[] {
  return Object.values(SLOT_REGISTRY).filter((s) => s.filledFor.includes(task));
}

/** A built-in task's slots; for a custom task id, the slots every task fills. */
export function slotsFor(task: string): readonly SlotSpec[] {
  const builtIn = builtInTask(task);
  if (builtIn) return slotsForTask(builtIn);
  return Object.values(SLOT_REGISTRY).filter((s) => ALL.every((t) => s.filledFor.includes(t)));
}

export function isBuiltInSlot(name: string): boolean {
  return Object.hasOwn(SLOT_REGISTRY, name);
}

export function requiredMissingSlots(task: string, userTemplate: string): readonly string[] {
  return slotsFor(task)
    .filter((s) => s.required && !userTemplate.includes(`{{${s.name}}}`))
    .map((s) => s.name);
}

export interface SlotValidationResult {
  ok: boolean;
  errors: { message: string; slot?: string }[];
  warnings: { message: string; slot?: string }[];
}

/** A custom task id skips the per-task availability check: its prompt may use any known slot. */
export function validateAgainstSlots(template: PromptTemplate, task: string): SlotValidationResult {
  const errors: SlotValidationResult['errors'] = [];
  const warnings: SlotValidationResult['warnings'] = [];
  const builtIn = builtInTask(task);
  const missing = requiredMissingSlots(task, template.user);

  for (const name of missing) {
    errors.push({
      message: `The message needs the ${SLOT_REGISTRY[name]?.label ?? name} variable. Add it with Insert variable.`,
      slot: name,
    });
  }

  const seen = new Set<string>();
  const taskSlots = builtIn ? new Set(slotsForTask(builtIn).map((s) => s.name)) : null;
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
      if (builtIn && taskSlots && !taskSlots.has(name)) {
        warnings.push({
          message: `{{${name}}} is not available for the ${TASK_LABELS[builtIn]} task`,
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
