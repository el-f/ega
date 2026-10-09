/** The task list; Task derives from it, so a new task is a compile error at every exhaustive switch. */
export const ALL_TASKS = [
  'translate',
  'explain',
  'summarize',
  'reword',
  'grammar',
  'suggest-replies',
  'ask',
] as const;
export type Task = (typeof ALL_TASKS)[number];

/** The built-in task with this id; null for a custom or unknown id. */
export function builtInTask(id: string): Task | null {
  return (ALL_TASKS as readonly string[]).includes(id) ? (id as Task) : null;
}

/** The default task to run now: an off default runs as Translate. The read path already turned a deleted one into Translate. */
export function runnableDefaultTask(s: {
  defaultTask: string;
  disabledTasks: readonly string[];
}): string {
  return s.disabledTasks.includes(s.defaultTask) ? 'translate' : s.defaultTask;
}

/**
 * What an entry that runs the default task calls itself (the bubble, the popup's "Translate anyway"): null while
 * that task is Translate, so the entry keeps Translate's own words ("Translate to English"); otherwise the task's
 * name ("Summarize"), a custom task's from `customs`. Null too for a custom id the list no longer has.
 */
export function defaultTaskName(
  s: { defaultTask: string; disabledTasks: readonly string[] },
  customs: readonly { id: string; label: string }[],
): string | null {
  const id = runnableDefaultTask(s);
  if (id === 'translate') return null;
  const t = builtInTask(id);
  return t !== null ? TASK_LABELS[t] : (customs.find((c) => c.id === id)?.label ?? null);
}

/** The tasks the vision arm can run; every other task falls back to translate when an image is attached. */
export const IMAGE_TASKS = ['translate', 'explain'] as const satisfies readonly Task[];
/** A task that can read an image. Derived from IMAGE_TASKS, so a third one reaches every site that names it. */
export type ImageTask = (typeof IMAGE_TASKS)[number];
export function isImageTask(task: Task): task is ImageTask {
  return (IMAGE_TASKS as readonly Task[]).includes(task);
}

/** Tone applies to reword only; default 'neutral'. */
export const ALL_TONES = ['formal', 'casual', 'neutral', 'polite', 'blunt'] as const;
export type Tone = (typeof ALL_TONES)[number];

export const TASK_LABELS: Record<Task, string> = {
  translate: 'Translate',
  explain: 'Explain',
  summarize: 'Summarize',
  reword: 'Reword',
  grammar: 'Grammar',
  'suggest-replies': 'Reply ideas',
  ask: 'Ask',
};

/** Gerund for loading states, so the shimmer label names the task the user invoked. */
export const TASK_GERUND: Record<Task, string> = {
  translate: 'Translating',
  explain: 'Explaining',
  summarize: 'Summarizing',
  reword: 'Rewording',
  grammar: 'Fixing grammar',
  'suggest-replies': 'Drafting replies',
  ask: 'Thinking',
};

/** The loading label for any task id; a custom task reads "Working". */
export function taskGerund(id: string): string {
  return (TASK_GERUND as Record<string, string | undefined>)[id] ?? 'Working';
}

/** Human-readable label for each tone. */
export const TONE_LABELS: Record<Tone, string> = {
  formal: 'Formal',
  casual: 'Casual',
  neutral: 'Neutral',
  polite: 'Polite',
  blunt: 'Blunt',
};
