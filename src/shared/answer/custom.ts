import * as v from 'valibot';
import type { CustomTask } from '../settings-schema';
import { storedAnswerV1Schema, type StoredAnswerSpec } from '../custom-answer-schema';
import { CUSTOM_PRESETS, type AnswerSpec } from './spec';
import { renderFormat } from './render-format';

type CustomAnswerInput = Pick<CustomTask, 'output'> & { answer?: StoredAnswerSpec };

/** Absent, unknown or invalid specs keep the legacy preset and its pinned bytes. */
export function customAnswerSpec(row: CustomAnswerInput, id = 'draft'): AnswerSpec {
  const parsed = v.safeParse(storedAnswerV1Schema, row.answer);
  if (!parsed.success)
    return CUSTOM_PRESETS[row.output === 'card' ? 'answer-notes' : 'answer-only'];
  const answer = parsed.output;
  if (answer.preset) return CUSTOM_PRESETS[answer.preset];
  return { id: `custom:${id}`, version: 1, fields: answer.fields ?? [], join: 'after-build' };
}

export function customAnswerContract(row: CustomAnswerInput, id?: string): string {
  return renderFormat(customAnswerSpec(row, id)).text;
}

/** Older builds still get a usable plain/card row when they discard answer. */
export function answerOutput(
  answer: StoredAnswerSpec | undefined,
  fallback: 'plain' | 'card',
): 'plain' | 'card' {
  if (answer?.v !== 1) return fallback;
  return customAnswerSpec({ answer, output: fallback }).fields.some((f) => f.role === 'notes')
    ? 'card'
    : 'plain';
}
