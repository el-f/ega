/** The earlier result a question is about: frozen on the question when it is sent, so retry and reload need no lookup. */
export interface AskAbout {
  /** The assistant turn asked about; the quote links to it while it exists. */
  turnId: string;
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

/** What an answer's About says it was asked about: the copy sent, 'gone' once that copy left with a deleted reply,
 *  'unsent' for a version run while the reply was deleted. */
export type AskedAbout = AskAbout | 'gone' | 'unsent';

const ASK_ABOUT_CAPS = {
  turnId: 200,
  task: 120,
  languages: 120,
  original: 2000,
  result: 2000,
  notes: 1000,
} as const;

const QUOTE_MAX = 200;

function clip(v: string, max: number): string {
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : clip(t, max);
}

/** Validates and caps an untrusted value; null when it is not a usable AskAbout. */
export function capAskAbout(x: unknown): AskAbout | null {
  if (x === null || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const turnId = text(o['turnId'], ASK_ABOUT_CAPS.turnId);
  const task = text(o['task'], ASK_ABOUT_CAPS.task);
  const result = text(o['result'], ASK_ABOUT_CAPS.result);
  if (turnId === undefined || task === undefined || result === undefined) return null;
  const languages = text(o['languages'], ASK_ABOUT_CAPS.languages);
  const notes = text(o['notes'], ASK_ABOUT_CAPS.notes);
  return {
    turnId,
    task,
    ...(languages !== undefined ? { languages } : {}),
    original: text(o['original'], ASK_ABOUT_CAPS.original) ?? '',
    result,
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** One line of Markdown as plain text: no heading, list or quote marker, no emphasis or code marks, links as their text. */
function plainLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)+/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|~~|[*`]/g, '')
    .trim();
}

/** The quote a question shows: the result's first line of text, Markdown removed. */
export function askQuote(a: Pick<AskAbout, 'result'>): string {
  const first =
    a.result
      .split('\n')
      .filter((l) => !/^\s*(?:```|~~~)/.test(l))
      .map(plainLine)
      .find((l) => l !== '') ?? '';
  return clip(first, QUOTE_MAX);
}
