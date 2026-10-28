import * as v from 'valibot';
import { ALL_TONES, type Tone } from './task-prompts';
import { TaskIdSchema } from './settings-schema';
import type { TaskId } from './task-view';
import { IMAGE_DATA_URL_MAX_CHARS, MAX_SELECTION_CHARS } from './constants';
import { makeCrossContextLock } from './utils/cross-context-lock';
import { capText } from './text-cap';
import type {
  AnswerReplyFields,
  AnswerSnapshot,
  DetectedVariety,
  ResultAttempt,
  ResultMeta,
} from './types';
import type { AnswerDetail, AnswerNote } from './answer/reader';

export const PENDING_POPUP_HANDOFF_KEY = 'ega.pendingPopupHandoff';

/** Older queued handoffs are dropped on drain, so a sidepanel opened much later doesn't replay them. */
export const MAX_HANDOFF_AGE_MS = 60_000;

/** Per-field cap so a corrupt storage.session entry can't flood sidepanel state. */
const MAX_HANDOFF_FIELD_CHARS = 50_000;

/** A detection is a label on the meta line and in a question's about block, so it stays short. */
const DETECTED_ID_MAX = 128;
const DETECTED_DETAIL_MAX = 200;
const DETECTED_LANGS_MAX = 8;
/** Notes and details per reply; a real answer has a handful. */
const REPLY_ENTRIES_MAX = 32;

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
  /** The tooltip's Ask: the panel lands the finished reply, then asks about it. */
  readonly ask?: true;
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

function shortText(raw: unknown, max: number): string | undefined {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= max ? raw : undefined;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** Malformed entries are skipped and the list is cut to its cap; nothing usable left drops the field. */
function decodeDetectedLangs(raw: unknown): DetectedVariety[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DetectedVariety[] = [];
  for (const entry of raw as unknown[]) {
    if (out.length === DETECTED_LANGS_MAX) break;
    if (!isRecord(entry)) continue;
    const id = shortText(entry['id'], DETECTED_ID_MAX);
    if (id === undefined) continue;
    const detail = shortText(entry['detail'], DETECTED_DETAIL_MAX);
    out.push(detail !== undefined ? { id, detail } : { id });
  }
  return out.length > 0 ? out : undefined;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const flag = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const textList = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every((s) => typeof s === 'string') ? (v as string[]) : undefined;

/** Notes and details render in keyed lists, so an entry with no string key, or a key seen before, would throw on every render. */
function decodeKeyed<T>(
  raw: unknown,
  build: (e: Record<string, unknown>, key: string, label: string) => T,
): T[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of raw as unknown[]) {
    if (out.length === REPLY_ENTRIES_MAX) break;
    if (!isRecord(e)) continue;
    const key = text(e['key']);
    const label = text(e['label']);
    if (key === undefined || label === undefined || seen.has(key)) continue;
    seen.add(key);
    out.push(build(e, key, label));
  }
  return out.length > 0 ? out : undefined;
}

function decodeAttempts(raw: unknown): ResultAttempt[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return (raw as unknown[]).flatMap((e): ResultAttempt[] => {
    if (!isRecord(e)) return [];
    const backendId = text(e['backendId']);
    const latencyMs = count(e['latencyMs']);
    const { status } = e;
    if (backendId === undefined || latencyMs === undefined) return [];
    if (status !== 'ok' && status !== 'error') return [];
    const code = text(e['code']);
    const message = text(e['message']);
    return [
      {
        backendId: backendId as ResultAttempt['backendId'],
        status,
        latencyMs,
        ...(code !== undefined ? { code } : {}),
        ...(message !== undefined ? { message } : {}),
      },
    ];
  });
}

function decodeAnswerFormat(raw: unknown): ResultMeta['answerFormat'] {
  if (!isRecord(raw)) return undefined;
  const spec = text(raw['spec']);
  const { checkedBy } = raw;
  if (spec === undefined || (checkedBy !== 'backend' && checkedBy !== 'prompt')) return undefined;
  const issues = textList(raw['issues']);
  return { spec, checkedBy, ...(issues !== undefined ? { issues } : {}) };
}

/** Every ResultMeta field with its decoder: a field added to the type fails the build until it gets one here. */
const META_FIELDS: Record<keyof ResultMeta, (v: unknown) => unknown> = {
  answerFormat: decodeAnswerFormat,
  backendId: text,
  cacheHit: flag,
  latencyMs: count,
  firstTokenMs: count,
  attempts: decodeAttempts,
  modelId: text,
  sourceLang: text,
  targetLang: text,
  detectedLang: text,
  detectedDetail: text,
  detectedLangs: decodeDetectedLangs,
  explain: text,
  inputTokens: count,
  outputTokens: count,
  cacheReadTokens: count,
  cacheWriteTokens: count,
  reasoningTokens: count,
  historyTurns: count,
  pageContextSent: flag,
  imageArm: (v) => (v === 'ocr' || v === 'task' || v === 'text' ? v : undefined),
  instructions: text,
  instructionsLength: count,
};

function decodeMeta(raw: unknown): ResultMeta | undefined {
  if (!isRecord(raw)) return undefined;
  const out = Object.fromEntries(
    Object.entries(META_FIELDS).flatMap(([k, decode]) => {
      const v = decode(raw[k]);
      return v === undefined ? [] : [[k, v]];
    }),
  );
  // The meta line reads these on every render.
  return 'backendId' in out && 'cacheHit' in out && 'latencyMs' in out
    ? (out as unknown as ResultMeta)
    : undefined;
}

/** The About panel looks fields up by key in the spec, so a spec field that is not an object would throw. */
function decodeAnswer(raw: unknown): AnswerSnapshot | undefined {
  if (!isRecord(raw) || !isRecord(raw['fields']) || !isRecord(raw['spec'])) return undefined;
  const specFields = raw['spec']['fields'];
  if (!Array.isArray(specFields) || !specFields.every(isRecord)) return undefined;
  return raw as unknown as AnswerSnapshot;
}

/** The panel spreads the reply onto the turn it seeds, so only known fields of the right type pass: a stray `id` or `status` would replace the turn's own. */
function decodeReply(raw: unknown): AnswerReplyFields | undefined {
  if (!isRecord(raw) || JSON.stringify(raw).length > MAX_HANDOFF_FIELD_CHARS) return undefined;
  const detectedLang = shortText(raw['detectedLang'], DETECTED_ID_MAX);
  const detectedDetail = shortText(raw['detectedDetail'], DETECTED_DETAIL_MAX);
  const detectedLangs = decodeDetectedLangs(raw['detectedLangs']);
  const c = raw['confidence'];
  const confidence = typeof c === 'number' && c >= 0 && c <= 1 ? c : undefined;
  const notes = decodeKeyed<AnswerNote>(raw['notes'], (e, key, label) => {
    const body = text(e['text']);
    const items = textList(e['items']);
    return {
      key,
      label,
      ...(body !== undefined ? { text: body } : {}),
      ...(items !== undefined ? { items } : {}),
    };
  });
  const details = decodeKeyed<AnswerDetail>(raw['details'], (e, key, label) => ({
    key,
    label,
    value: e['value'],
  }));
  const answer = decodeAnswer(raw['answer']);
  const meta = decodeMeta(raw['meta']);
  const { explain } = raw;
  return {
    ...(notes !== undefined ? { notes } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(answer !== undefined ? { answer } : {}),
    ...(typeof explain === 'string' ? { explain } : {}),
    ...(meta !== undefined ? { meta } : {}),
    ...(detectedLang !== undefined ? { detectedLang } : {}),
    ...(detectedDetail !== undefined ? { detectedDetail } : {}),
    ...(detectedLangs !== undefined ? { detectedLangs } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  };
}

function decodeEntry(raw: unknown, now: number): PendingPopupHandoff | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['sourceText'] !== 'string') return null;
  // Clamp instead of reject: dropping the entry would silently lose the user's message.
  const trimmed = r['sourceText'].length > MAX_SELECTION_CHARS;
  const sourceText = capText(r['sourceText'], MAX_SELECTION_CHARS);
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
  const reply = decodeReply(r['reply']);
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
    ...(r['ask'] === true ? { ask: true } : {}),
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
