import type { Task } from './task-prompts';

/** Where a template lives — global, per-task, or per-preset. */
export type Scope =
  { scope: 'global' } | { scope: 'task'; task: Task } | { scope: 'preset'; presetId: string };
