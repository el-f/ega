import type { Task } from '@/shared/task-prompts';
import type { TranslationRequest } from '@/shared/types';

// Rewrites explain to translate + explain, so callers must read `taskBackends['explain']` before calling this.
export interface NormalisedRouting {
  /** Task name to use for template / cache resolution. */
  task: Task;
  /** Updated options, with `explain` forced true when the original
   *  task was `'explain'`. */
  options: TranslationRequest['options'];
}

export function normaliseExplainRouting(options: TranslationRequest['options']): NormalisedRouting {
  const original: Task = options.task ?? 'translate';
  if (original === 'explain') {
    return {
      task: 'translate',
      options: { ...options, task: 'translate', explain: true },
    };
  }
  return { task: original, options };
}
