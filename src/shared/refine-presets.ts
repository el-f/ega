// The Refine menu's one-click changes, shared by reply surfaces (side panel spec §5.4).
import type { TaskId } from '@/shared/task-view';
import { builtInTask, type Task } from '@/shared/task-prompts';

export interface RefinePreset {
  id: string;
  label: string;
  /** Sent with the request and stored on the version; old versions match on it, so the wording never changes. */
  body: string;
}

const SHORTER: RefinePreset = { id: 'shorter', label: 'Shorter', body: 'Make outputs shorter.' };
const LESS_FORMAL: RefinePreset = {
  id: 'less-formal',
  label: 'Less formal',
  body: 'Keep outputs less formal than the source.',
};
const KEEP_SLANG: RefinePreset = {
  id: 'keep-slang',
  label: 'Keep slang',
  body: 'Preserve slang and style markers verbatim — do not normalise.',
};
const SIMPLER: RefinePreset = {
  id: 'simpler',
  label: 'Simpler',
  body: 'Use simpler words and shorter sentences.',
};
const BULLETS: RefinePreset = {
  id: 'bullets',
  label: 'Bullet points',
  body: 'Answer as a short bullet list.',
};
const MORE_FORMAL: RefinePreset = {
  id: 'more-formal',
  label: 'More formal',
  body: 'Make the wording more formal.',
};
const EXPLAIN_CHANGES: RefinePreset = {
  id: 'explain-changes',
  label: 'Explain changes',
  body: 'After the corrected text, list each change in one short line.',
};

const BY_TASK: Readonly<Record<Task, readonly RefinePreset[]>> = {
  translate: [SHORTER, LESS_FORMAL, KEEP_SLANG],
  explain: [SHORTER, SIMPLER],
  summarize: [SHORTER, BULLETS],
  reword: [SHORTER, MORE_FORMAL, LESS_FORMAL],
  grammar: [EXPLAIN_CHANGES],
  'suggest-replies': [SHORTER, MORE_FORMAL],
  ask: [SHORTER, SIMPLER],
};

/** A custom task has its own prompt the presets were not written for, so it gets none. */
export function refinePresets(task: TaskId): readonly RefinePreset[] {
  const builtin = builtInTask(task);
  return builtin === null ? [] : BY_TASK[builtin];
}

/** "Explain instead", with a verb where the task name is not one. */
export function answerAgainLabel(task: TaskId, label: string): string {
  if (task === 'grammar') return 'Fix grammar instead';
  if (task === 'suggest-replies') return 'Suggest replies instead';
  return `${label} instead`;
}
