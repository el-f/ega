import * as v from 'valibot';
import { ALL_TONES, type Tone } from './task-prompts';
import { TaskIdSchema } from './settings-schema';
import type { TaskId } from './task-view';
import { IMAGE_DATA_URL_MAX_CHARS, MAX_SELECTION_CHARS } from './constants';
import { makeCrossContextLock } from './utils/cross-context-lock';
import type { AnswerReplyFields } from './types';

export const PENDING_POPUP_HANDOFF_KEY = 'ega.pendingPopupHandoff';

/** Older queued handoffs are dropped on drain, so a sidepanel opened much later doesn't replay them. */
export const MAX_HANDOFF_AGE_MS = 60_000;

/** Per-field cap so a corrupt storage.session entry can't flood sidepanel state. */
const MAX_HANDOFF_FIELD_CHARS = 50_000;

export interface PendingPopupHandoff {
  readonly sourceText: string;
  readonly sourceLang: string;
  readonly targetLang: string;
  /** Any task id; the side panel runs an unknown or off one as Translate. */
  readonly task: TaskId;
  readonly tone: Tone;
  /** Date.now at write time; the writer stamps it when absent. Entries without it fail decode. */
  readonly ts?: number;
  /** Tooltip answer; the sidepanel seeds it as a delivered turn, so the turn is terminal. */
  readonly response?: string;
  /** Source image: an http(s) URL or a data: URL, same as `Turn.imageDataUrl`. */
  readonly imageDataUrl?: string;
  readonly ocrText?: string;
  /** Unlike `response` this leaves the turn open: the panel still dispatches the translation. */
  readonly explain?: string;
  readonly reply?: AnswerReplyFields;
  /** Set by the reader when `sourceText` was cut to MAX_SELECTION_CHARS, so the panel can say so. */
  readonly trimmed?: boolean;
  /** Set by the reader when `imageDataUrl` was over IMAGE_DATA_URL_MAX_CHARS and dropped, so the panel can say so. */
  readonly imageDropped?: boolean;
  /** A failed tooltip image: the panel puts `imageDataUrl` in the composer and sends nothing. */
  readonly attachImage?: boolean;
  /** Browser window the send came from; only that window's panel drains it. */
  readonly windowId?: number;
}

export type PendingPopupHandoffMap = Record<string, PendingPopupHandoff>;

// Writers run in the popup and SW realms; the drain's get-then-remove needs a lock all of them share.
const lock = makeCrossContextLock('ega:popup-handoff');
let counter = 0;
function nextId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now()}-${counter}`;
}

/** Both parts compare as numbers because the counter is unpadded, so a string sort puts `-10` before `-9`. */
function compareKeys(a: string, b: string): number {
  const [ta, ca] = a.split('-');
  const [tb, cb] = b.split('-');
  const byTs = Number(ta) - Number(tb);
  if (byTs !== 0 && !Number.isNaN(byTs)) return byTs;
  const byCounter = Number(ca) - Number(cb);
  return Number.isNaN(byCounter) ? 0 : byCounter;
}

function decodeEntry(raw: unknown, now: number): PendingPopupHandoff | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['sourceText'] !== 'string') return null;
  // Clamp instead of reject: dropping the entry would silently lose the user's message.
  const trimmed = r['sourceText'].length > MAX_SELECTION_CHARS;
  const sourceText = trimmed ? r['sourceText'].slice(0, MAX_SELECTION_CHARS) : r['sourceText'];
  if (typeof r['sourceLang'] !== 'string') return null;
  if (typeof r['targetLang'] !== 'string') return null;
  if (!v.is(TaskIdSchema, r['task'])) return null;
  if (typeof r['tone'] !== 'string') return null;
  if (!(ALL_TONES as readonly string[]).includes(r['tone'])) return null;
  const tsRaw = r['ts'];
  if (typeof tsRaw !== 'number') return null;
  if (now - tsRaw > MAX_HANDOFF_AGE_MS) return null;
  // Any same-extension context can write storage.session, so an over-cap field is dropped, not clamped.
  const optStr = (key: string): string | undefined =>
    typeof r[key] === 'string' && (r[key] as string).length <= MAX_HANDOFF_FIELD_CHARS
      ? (r[key] as string)
      : undefined;
  const response = optStr('response');
  const rawImage = r['imageDataUrl'];
  const imageDataUrl =
    typeof rawImage === 'string' && rawImage.length <= IMAGE_DATA_URL_MAX_CHARS
      ? rawImage
      : undefined;
  const imageDropped = typeof rawImage === 'string' && imageDataUrl === undefined;
  const ocrText = optStr('ocrText');
  const explain = optStr('explain');
  const replyRaw = r['reply'];
  // A completed reply is written by the worker; bound its size just like response.
  const reply =
    replyRaw !== null &&
    typeof replyRaw === 'object' &&
    !Array.isArray(replyRaw) &&
    JSON.stringify(replyRaw).length <= MAX_HANDOFF_FIELD_CHARS
      ? (replyRaw as AnswerReplyFields)
      : undefined;
  const windowId = typeof r['windowId'] === 'number' ? r['windowId'] : undefined;
  return {
    sourceText,
    sourceLang: r['sourceLang'],
    targetLang: r['targetLang'],
    task: r['task'],
    tone: r['tone'] as Tone,
    ts: tsRaw,
    ...(trimmed ? { trimmed: true } : {}),
    ...(imageDropped ? { imageDropped: true } : {}),
    ...(r['attachImage'] === true ? { attachImage: true } : {}),
    ...(response !== undefined ? { response } : {}),
    ...(imageDataUrl !== undefined ? { imageDataUrl } : {}),
    ...(ocrText !== undefined ? { ocrText } : {}),
    ...(explain !== undefined ? { explain } : {}),
    ...(reply !== undefined ? { reply } : {}),
    ...(windowId !== undefined ? { windowId } : {}),
  };
}

function decodeStored(raw: unknown, now: number): PendingPopupHandoffMap {
  if (raw === null || typeof raw !== 'object') return {};
  const out: PendingPopupHandoffMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const entry = decodeEntry(v, now);
    if (entry !== null) out[k] = entry;
  }
  return out;
}

async function readMap(): Promise<PendingPopupHandoffMap> {
  const out = await chrome.storage.session.get(PENDING_POPUP_HANDOFF_KEY);
  return decodeStored((out as Record<string, unknown>)[PENDING_POPUP_HANDOFF_KEY], Date.now());
}

/** The caller must await this before `window.close()`, or the entry never lands. */
export function writePendingPopupHandoff(payload: PendingPopupHandoff): Promise<void> {
  return lock(async () => {
    const cur = await readMap();
    cur[nextId()] = { ...payload, ts: payload.ts ?? Date.now() };
    await chrome.storage.session.set({ [PENDING_POPUP_HANDOFF_KEY]: cur });
  });
}

/**
 * Returns this window's queued handoffs in insertion order and clears them, so a re-mount can't
 * double-seed. Another window's entries stay queued for the panel that belongs to them; an entry
 * with no windowId (an older queue) still drains to whoever asks first.
 */
export function drainPendingPopupHandoff(
  windowId?: number,
): Promise<readonly PendingPopupHandoff[]> {
  return lock(async () => {
    const cur = await readMap();
    const entries = Object.entries(cur).sort(([a], [b]) => compareKeys(a, b));
    if (entries.length === 0) return [];
    const isMine = ([, v]: [string, PendingPopupHandoff]): boolean =>
      windowId === undefined || v.windowId === undefined || v.windowId === windowId;
    const mine = entries.filter(isMine);
    const others = entries.filter((e) => !isMine(e));
    // Writing back an unchanged map would re-fire storage.onChanged and the two panels would ping-pong.
    if (mine.length === 0) return [];
    if (others.length === 0) {
      await chrome.storage.session.remove(PENDING_POPUP_HANDOFF_KEY);
    } else {
      await chrome.storage.session.set({
        [PENDING_POPUP_HANDOFF_KEY]: Object.fromEntries(others),
      });
    }
    return mine.map(([, v]) => v);
  });
}
