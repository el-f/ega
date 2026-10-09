// Pinned v1 format bytes. Change only with an explicit answer-spec version decision.
import type { Task } from '../task-prompts';

/** The JSON answer contract a built-in prompt ends with; the builder appends it after the editable text. */
export interface AnswerFormat {
  readonly text: string;
  /** How the shipped template joined it to the text before it, so the joined bytes stay the same. */
  readonly sep: ' ' | '\n' | '\n\n';
}

/** Every answer format starts with this, so a prompt that holds it already carries a format. */
export const FORMAT_MARKER = 'Return JSON ONLY';

type OwnPromptTask = Exclude<Task, 'translate' | 'explain'>;

export const TASK_FORMATS: Readonly<Record<OwnPromptTask, AnswerFormat>> = {
  summarize: { text: 'Return JSON ONLY: {"translation": <your summary as a string>}.', sep: ' ' },
  reword: {
    text: 'Return JSON ONLY: {"translation": <your rewrite as a string>, "explain": <one short sentence naming the tone and what changed>}.',
    sep: ' ',
  },
  grammar: {
    text: 'Return JSON ONLY: {"translation": <corrected text as a string>, "explain": <newline-separated list of corrections, one per line, format: "was X → now Y (reason)">}.',
    sep: ' ',
  },
  'suggest-replies': {
    text: [
      'Return JSON ONLY: {"translation": "<reply 1>\\n\\n<reply 2>\\n\\n<reply 3>"}.',
      'The three replies MUST be separated by a blank line in the translation field, in the order casual → neutral → polite.',
    ].join(' '),
    sep: ' ',
  },
  ask: { text: 'Return JSON ONLY: {"translation": <your answer as a string>}.', sep: ' ' },
};

/** The Translate prompt's format: the JSON line, then how to fill detectedDetail and detectedLangs. */
export const TRANSLATE_FORMAT: AnswerFormat = {
  text: [
    'Return JSON ONLY: {"translation": string, "confidence": number (0..1 — 1.0 = unambiguous, 0.8 = one clearly dominant reading, 0.5 = genuinely ambiguous between two readings, 0.2 = guessing — penalise for every [?…] token used), "detectedLang"?: string, "detectedDetail"?: string, "detectedLangs"?: Array<{id: string, detail?: string}>{{explainField}} }.',
    'If the variety has meaningful sub-dialects / regional or temporal markers (e.g. Arabizi → Levantine; Elvish → Quenya vs Sindarin), put a short (≤ 80 chars) descriptive tag in "detectedDetail", following the tagging rule above: only what the words themselves show. Omit it when there\'s nothing to add beyond the preset name.',
    'If and ONLY if the source clearly mixes multiple varieties (e.g. Arabizi mixed with Elvish, or Gen-Z slang interleaved with Spanglish), return a "detectedLangs" array with one entry per variety present — each entry is {id, detail?} with the same shape rules as detectedLang/detectedDetail. For a single-variety source, omit the field entirely.',
  ].join('\n'),
  sep: '\n',
};

/** The answer shape a custom task's prompt cannot change: one line after the user's own system text. */
export const PLAIN_CONTRACT = 'Return JSON ONLY: {"translation": <your answer as a string>}.';
export const CARD_CONTRACT =
  'Return JSON ONLY: {"translation": <your answer as a string>, "explain": <short notes as a string; leave the field out when there is nothing to note>}.';
