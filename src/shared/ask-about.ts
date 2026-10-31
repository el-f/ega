import { capText } from './text-cap';
import { isPlainAnswer, soleFencedCode } from './answer-presentation';
import type { AnswerSpec } from './answer/spec';

/** Which reply a question asks about: a reference, never a copy of its text (D58). Each request builds its
 *  block from the thread as it is then, so a deleted reply leaves every later request at once. */
export interface AskTarget {
  /** The assistant turn asked about; the quote links to it while it exists. */
  turnId: string;
  /** The version shown at Send; the reply's shown version once this one is gone. */
  variantId?: string;
}

/** The earlier result a question is about, as one request carries it. */
export interface AskAbout {
  /** The task that produced the result, as the user sees it ("Translate"). */
  task: string;
  /** The direction line with any detected detail ("Arabizi (Levantine) → English"). */
  languages?: string;
  /** What the user sent for that result. */
  original: string;
  /** The result's main text. */
  result: string;
  notes?: string;
}

/** What an answer's About says it was asked about: the block as built from the thread now with the reply's quote,
 *  'gone' once the reply left the conversation, 'unsent' for a version whose request carried no block. */
export type AskedAbout = { block: AskAbout; quote: string } | 'gone' | 'unsent';

const ASK_ABOUT_CAPS = {
  task: 120,
  languages: 120,
  original: 2000,
  result: 2000,
  notes: 1000,
} as const;

const ID_MAX = 200;
const QUOTE_MAX = 200;

function clip(v: string, max: number): string {
  return v.length > max ? `${capText(v, max - 1)}…` : v;
}

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : clip(t, max);
}

function id(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' && v.length <= ID_MAX ? v : undefined;
}

/** Validates and caps an untrusted value; null when it is not a usable AskAbout. */
export function capAskAbout(x: unknown): AskAbout | null {
  if (x === null || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const task = text(o['task'], ASK_ABOUT_CAPS.task);
  const result = text(o['result'], ASK_ABOUT_CAPS.result);
  if (task === undefined || result === undefined) return null;
  const languages = text(o['languages'], ASK_ABOUT_CAPS.languages);
  const notes = text(o['notes'], ASK_ABOUT_CAPS.notes);
  return {
    task,
    ...(languages !== undefined ? { languages } : {}),
    original: text(o['original'], ASK_ABOUT_CAPS.original) ?? '',
    result,
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** A stored reference, checked; any other field is dropped. */
export function askTargetOf(x: unknown): AskTarget | null {
  if (x === null || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const turnId = id(o['turnId']);
  if (turnId === undefined) return null;
  const variantId = id(o['variantId']);
  return variantId === undefined ? { turnId } : { turnId, variantId };
}

/** One line of Markdown as plain text: no heading, list or quote marker, no emphasis or code marks, links as their text. */
function plainLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)+/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|~~|[*`]/g, '')
    .trim();
}

/** The quote a question shows: a reply's first line of text as the panel shows it. A Markdown reply loses its
 *  Markdown; a plain one (a custom task's answer) and one fenced block (shown as code) keep every character. */
export function askQuote(reply: {
  content: string;
  answer?: { spec: Pick<AnswerSpec, 'join'> } | undefined;
}): string {
  const code = soleFencedCode(reply.content, true);
  const lines = (code ?? reply.content).split('\n');
  const shown =
    code !== null || isPlainAnswer(reply.answer?.spec, reply.content)
      ? lines.map((l) => l.trim())
      : lines.filter((l) => !/^\s*(?:```|~~~)/.test(l)).map(plainLine);
  return clip(shown.find((l) => l !== '') ?? '', QUOTE_MAX);
}
