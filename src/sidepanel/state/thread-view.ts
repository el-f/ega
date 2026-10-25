// Pure rules for the side panel thread, header list, composer chip and the block a question sends. No I/O, no clock: callers pass `now`.
import type { IndexEntry } from '@/shared/saved-conversations';
import type { AssistantTurnData, Turn, UserTurnData } from './conversation';
import {
  activeVariant,
  askable,
  askTargetFor,
  atVariant,
  isImageTurn,
  turnLabel,
  turnTaskValue,
} from './conversation';
import { taskLabel, type TaskView } from '@/shared/task-view';
import { TONE_LABELS, type Tone } from '@/shared/task-prompts';
import { detectedVarieties, directionLabel } from '@/shared/reply-meta';
import {
  askQuote,
  capAskAbout,
  type AskAbout,
  type AskedAbout,
  type AskTarget,
} from '@/shared/ask-about';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** What the next Send does: a new message, a replacement for one, a change to one reply, or a question about one.
 *  An edit keeps `lastId`, the newest message when it began: a newer one means the thread moved on. */
export type ComposerMode =
  | { kind: 'send' }
  | { kind: 'edit'; turnId: string; lastId: string }
  | { kind: 'refine'; turnId: string }
  | { kind: 'ask'; turnId: string };

/** The empty panel's three suggestions. */
export type SuggestionKind = 'translate-selection' | 'explain-selection' | 'translate-page';
/** What a suggestion did, so the line under the buttons can say it. */
export type SuggestionResult = 'sent' | 'no-selection' | 'unreadable' | 'page' | 'task-off';

/** A message this long after the one before it gets a day/time line above it. */
export const SEPARATOR_GAP_MS = 30 * MINUTE;

/** What a Conversations row is called: its first message, "Image" for an image-only start, else "New conversation". */
export function conversationTitle(e: Pick<IndexEntry, 'title' | 'imageFirst'>): string {
  if (e.title !== undefined && e.title !== '') return e.title;
  return e.imageFirst === true ? 'Image' : 'New conversation';
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", then the date. */
export function listTime(ts: number, now: number, locale?: string): string {
  const diff = Math.max(0, now - ts);
  if (diff < MINUTE) return 'just now';
  if (startOfDay(ts) === startOfDay(now)) {
    return diff < 60 * MINUTE
      ? `${Math.floor(diff / MINUTE)} min ago`
      : `${Math.floor(diff / (60 * MINUTE))} h ago`;
  }
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** "Today 14:02", "Yesterday 09:15", "Mon, Oct 5 · 14:02", "Oct 5, 2025 · 14:02" (time in the locale's format). */
export function separatorLabel(ts: number, now: number, locale?: string): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(locale, { timeStyle: 'short' });
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (d.getFullYear() !== new Date(now).getFullYear()) {
    return `${d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })} · ${time}`;
  }
  return `${d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`;
}

/** Ids of the turns that get a day/time line: the first one, and any that came 30+ minutes after the turn before it. */
export function separatorTurnIds(turns: readonly Turn[]): ReadonlySet<string> {
  const out = new Set<string>();
  let prev: number | undefined;
  for (const t of turns) {
    if (prev === undefined || t.createdAt - prev >= SEPARATOR_GAP_MS) out.add(t.id);
    prev = t.createdAt;
  }
  return out;
}

/** The names a reply's meta line shows: its task's, and its languages'. */
export interface AskLabels {
  views: readonly TaskView[];
  varieties: readonly { id: string; label: string }[];
}

/** The reply `target` points at, as the named version reads (the shown one once it is gone), else as its newest
 *  finished one. Undefined once the reply left the thread or has no finished text, so the quote and the block agree. */
function askedReply(thread: readonly Turn[], target: AskTarget): AssistantTurnData | undefined {
  const reply = thread.find(
    (t): t is AssistantTurnData => t.role === 'assistant' && t.id === target.turnId,
  );
  if (reply === undefined) return undefined;
  const newestFirst = [...(reply.variants ?? [])].reverse().map((v) => atVariant(reply, v.id));
  return [atVariant(reply, target.variantId), ...newestFirst].find(askable);
}

/** What a request asking about `target` carries, built from the thread as it is now, with the labels the reply's
 *  meta line shows. Null when that reply is gone or has no finished text, so the request carries none. */
export function askAboutFor(
  thread: readonly Turn[],
  target: AskTarget,
  labels: AskLabels,
): AskAbout | null {
  const reply = askedReply(thread, target);
  if (reply === undefined) return null;
  const asked = thread.find(
    (t): t is UserTurnData => t.role === 'user' && t.id === reply.attachedToTurnId,
  );
  // An image's message is a placeholder or a caption, not text the reply was made from.
  const image = asked !== undefined && isImageTurn(asked);
  const replyTask = turnTaskValue(reply);
  return capAskAbout({
    task:
      image && replyTask === 'translate' ? 'Translate image' : taskLabel(labels.views, replyTask),
    languages: replyDirection(reply, asked?.dispatch ?? {}, labels.varieties),
    original: image ? '' : (asked?.content ?? ''),
    result: reply.content,
    notes: notesText(reply),
  });
}

/** A reply's notes as "label: text" lines, else its explanation. */
function notesText(reply: AssistantTurnData): string | undefined {
  const parts = (reply.notes ?? []).flatMap((n) => {
    const body = n.text ?? n.items?.join('; ') ?? '';
    return body === '' ? [] : [`${n.label}: ${body}`];
  });
  return parts.length > 0 ? parts.join('\n') : reply.explain;
}

/** What About says the shown version of `answer` asked about: the block as it is built now, 'gone' once the
 *  reply left the thread, 'unsent' when the version's request carried none. Undefined when it asked about none. */
export function askedAboutFor(
  thread: readonly Turn[],
  answer: Turn,
  labels: AskLabels,
): AskedAbout | undefined {
  if (answer.role !== 'assistant') return undefined;
  const question = thread.find((t) => t.role === 'user' && t.id === answer.attachedToTurnId);
  const version = activeVariant(answer);
  const target = question === undefined ? undefined : askTargetFor(question, version);
  if (target === undefined) return undefined;
  if (version?.aboutUnsent === true) return 'unsent';
  return askAboutFor(thread, target, labels) ?? 'gone';
}

/** The quote a question's bubble links: the first line of the reply it asks about, read live; none once that reply left the thread. */
export function linkedQuote(
  holder: Turn,
  thread: readonly Turn[],
): { turnId: string; text: string } | undefined {
  const target = holder.role === 'user' ? holder.about : undefined;
  const reply = target === undefined ? undefined : askedReply(thread, target);
  return reply === undefined ? undefined : { turnId: reply.id, text: askQuote(reply.content) };
}

/** The task each user message names above its bubble, only where the task changes (or a first message that is not Translate). */
export function taskLabelsOnChange(
  turns: readonly Turn[],
  views: readonly TaskView[],
  thread: readonly Turn[],
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  let prev: string | undefined;
  for (const t of turns) {
    if (t.role !== 'user') continue;
    const task = t.taskId ?? (t.kind === 'image-translate' ? 'translate' : t.kind);
    const usesTone = views.find((v) => v.id === task)?.usesTone ?? task === 'reword';
    const tone = usesTone && t.tone !== undefined && t.tone !== 'neutral' ? t.tone : undefined;
    const key = `${task}|${tone ?? ''}`;
    const changed = prev === undefined ? task !== 'translate' || tone !== undefined : key !== prev;
    // A quoted question is marked by its quote; a task label would say it twice.
    if (changed && linkedQuote(t, thread) === undefined) {
      const base = turnLabel(t.kind === 'image-translate' ? { ...t, kind: 'translate' } : t, views);
      out.set(t.id, tone === undefined ? base : `${base} · ${TONE_LABELS[tone]}`);
    }
    prev = key;
  }
  return out;
}

export interface ModeChipInput {
  taskLabel: string;
  /** Reword and Grammar answer in the source language, so they name no target. */
  answersInTarget: boolean;
  /** Display names; `source` is undefined for Auto-detect. */
  source: string | undefined;
  target: string;
  tone?: Tone | undefined;
  /** An attached image goes to the image reader, whatever task is picked. */
  imageToTranslate?: boolean;
  /** Ask answers in the target, but the chip names only the task; its accessible name says the language. */
  asks?: boolean;
}

/** The composer chip: "Translate → English", "Translate · Spanish → English", "Reword · Casual", "Translate image → English", "Ask". */
export function modeChipLabel(i: ModeChipInput): string {
  if (i.imageToTranslate === true) return `Translate image → ${i.target}`;
  if (i.asks === true) return i.taskLabel;
  const tone = i.tone !== undefined && i.tone !== 'neutral' ? ` · ${TONE_LABELS[i.tone]}` : '';
  if (!i.answersInTarget) {
    return i.source === undefined ? `${i.taskLabel}${tone}` : `${i.taskLabel} · ${i.source}${tone}`;
  }
  if (i.source === undefined) return `${i.taskLabel} → ${i.target}${tone}`;
  return `${i.taskLabel} · ${i.source} → ${i.target}${tone}`;
}

/** A reply's meta-line direction, "Arabizi (Levantine) → English": the shown version's languages over the pair `sent` asked for. */
export function replyDirection(
  turn: Turn,
  sent: { sourceLang?: string | undefined; targetLang?: string | undefined },
  varieties: readonly { id: string; label: string }[],
  opts: { short?: boolean } = {},
): string {
  const task = turnTaskValue(turn);
  // An answer to a question has no languages of its own: nothing was detected, and the sent pair is the composer's.
  if (task === 'ask') return '';
  const v = activeVariant(turn);
  const source = v?.sourceLang ?? sent.sourceLang;
  const target = v?.targetLang ?? sent.targetLang;
  return directionLabel({
    detected: detectedVarieties(turn),
    ...(source !== undefined ? { sourceLang: source } : {}),
    ...(target !== undefined ? { targetLang: target } : {}),
    sourceOnly: task === 'reword' || task === 'grammar',
    varieties,
    ...(opts.short === true ? { short: true } : {}),
  });
}

/** What the swap button does, or null when it cannot act (then it is not shown). Auto-detect swaps with the newest reply's language. */
export function swapResult(
  source: string,
  target: string,
  detected: string | undefined,
): { source: string; target: string } | null {
  if (source !== 'auto') return source === target ? null : { source: target, target: source };
  if (detected === undefined || detected === target) return null;
  return { source: target, target: detected };
}
