import { builtInTask } from '@/shared/task-prompts';
import { isBuiltInSlot, SLOT_REGISTRY, slotsFor, type SlotSpec } from '@/shared/slot-registry';
import { SLOT_RE } from '@/shared/snippets';
import type { PromptTemplate } from '@/shared/types';

/** Which prompt the editor holds; it decides the variables on offer and the answer format shown. */
export type PromptKind = 'translate' | 'task' | 'custom' | 'language';

export interface EmptyVariable {
  slot: SlotSpec;
  /** Why it stays empty here, shown as the row's second line. */
  reason: string;
}

export interface PromptVariables {
  filled: readonly SlotSpec[];
  empty: readonly EmptyVariable[];
}

const offered = (): SlotSpec[] => Object.values(SLOT_REGISTRY).filter((s) => s.offered);

function reasonFor(slot: SlotSpec, kind: PromptKind): string {
  if (kind === 'custom') return 'Not filled for your own tasks';
  if (slot.name === 'explainInstr') return 'Filled only for Explain';
  if (slot.name === 'detectiveInstr')
    return 'Filled only for the Translate prompt and language prompts';
  return 'Not filled for this task';
}

/** The Translate prompt and language prompts also run Explain, so they fill every variable. */
export function variablesFor(kind: PromptKind, task: string): PromptVariables {
  const all = offered();
  if (kind === 'translate' || kind === 'language') return { filled: all, empty: [] };
  const filledNames = new Set(slotsFor(builtInTask(task) ?? task).map((s) => s.name));
  return {
    filled: all.filter((s) => filledNames.has(s.name)),
    empty: all
      .filter((s) => !filledNames.has(s.name))
      .map((slot) => ({
        slot,
        reason: reasonFor(slot, kind),
      })),
  };
}

export interface PromptChecks {
  /** Blocks saving the message: it lacks the selected text. */
  messageError: string | null;
  /** Shown, never blocking: unknown names, and variables this prompt leaves empty. */
  warnings: readonly string[];
}

export function checkPrompt(tpl: PromptTemplate, kind: PromptKind, task: string): PromptChecks {
  const messageError = tpl.user.includes('{{text}}')
    ? null
    : `The message needs the ${SLOT_REGISTRY['text']?.label ?? 'Selected text'} variable. Add it with Insert variable.`;
  const empty = new Map(variablesFor(kind, task).empty.map((e) => [e.slot.name, e.slot]));
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const text of [tpl.system, tpl.user]) {
    for (const m of text.matchAll(SLOT_RE)) {
      const name = m[1] ?? '';
      if (name === '' || seen.has(name)) continue;
      seen.add(name);
      if (!isBuiltInSlot(name)) warnings.push(`{{${name}}} is not a variable, so it will be empty`);
      else if (empty.has(name))
        warnings.push(`${empty.get(name)?.label ?? name} is empty for this task`);
    }
  }
  return { messageError, warnings };
}
