import type { Task } from '@/shared/task-prompts';

/** One-line description of what each task does, for the task dialog. Not in task-prompts.ts: the content script loads that module. */
export const TASK_DESCRIPTIONS: Record<Task, string> = {
  translate: 'Translate the text into the target language.',
  explain: "Explain the text's meaning, subtext, and cultural context, in the target language.",
  summarize: 'Summarize the text in 1–3 sentences, in the target language.',
  reword: 'Rewrite the text in a different tone, preserving meaning.',
  grammar: 'Fix grammar, spelling, and punctuation.',
  'suggest-replies':
    'Draft 3 short reply suggestions to the text — in the target language, labeled by tone.',
  ask: 'Ask a follow-up question about the conversation, answered in the target language.',
};
