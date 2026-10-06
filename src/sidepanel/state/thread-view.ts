// Pure view rules for the side panel thread, header list and composer chip. No I/O, no clock: callers pass `now`.
import type { IndexEntry } from '@/shared/saved-conversations';
import type { Turn } from './conversation';
import { turnLabel } from './conversation';
import type { TaskView } from '@/shared/task-view';
import { TONE_LABELS, type Tone } from '@/shared/task-prompts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** What the next Send does: a new message, a replacement for one, or a change to one reply. */
export type ComposerMode =
  { kind: 'send' } | { kind: 'edit'; turnId: string } | { kind: 'refine'; turnId: string };

/** The empty panel's three suggestions. */
export type SuggestionKind = 'translate-selection' | 'explain-selection' | 'translate-page';
/** What a suggestion did, so the line under the buttons can say it. */
export type SuggestionResult = 'sent' | 'no-selection' | 'unreadable' | 'page';

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

/** The task each user message names above its bubble, only where the task changes (or a first message that is not Translate). */
export function taskLabelsOnChange(
  turns: readonly Turn[],
  views: readonly TaskView[],
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
    if (changed) {
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
}

/** The composer chip: "Translate → English", "Translate · Spanish → English", "Reword · Casual", "Translate image → English". */
export function modeChipLabel(i: ModeChipInput): string {
  if (i.imageToTranslate === true) return `Translate image → ${i.target}`;
  const tone = i.tone !== undefined && i.tone !== 'neutral' ? ` · ${TONE_LABELS[i.tone]}` : '';
  if (!i.answersInTarget) {
    return i.source === undefined ? `${i.taskLabel}${tone}` : `${i.taskLabel} · ${i.source}${tone}`;
  }
  if (i.source === undefined) return `${i.taskLabel} → ${i.target}${tone}`;
  return `${i.taskLabel} · ${i.source} → ${i.target}${tone}`;
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
