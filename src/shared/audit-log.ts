import { ALL_TASKS, type Task } from './task-prompts';
import type { BackendId } from './types';
import { makeAsyncLock } from './utils/async-lock';
import { uuid } from './uuid';

export const AUDIT_LOG_CAP = 50;
/** Page translate fires one row per block; without this cap one page evicts every interactive row. */
export const AUDIT_BATCH_CAP = 10;
const STORAGE_KEY = 'egaAuditLog';

// Success-path cap bounds PII at rest: 200 chars is enough to recognize an entry, not to rebuild the page text.
export const AUDIT_MAX_PROMPT_CHARS = 200;
export const AUDIT_MAX_RESPONSE_CHARS = 200;

// The error path allows 1000 chars so a bug report is diagnosable; the 50-entry cap keeps the store near 50KB.
export const AUDIT_MAX_PROMPT_CHARS_WITH_ERROR = 1_000;
export const AUDIT_MAX_RESPONSE_CHARS_WITH_ERROR = 1_000;

// Some SDKs echo the whole request body into error.message, so it needs its own cap.
export const AUDIT_MAX_ERROR_MESSAGE_CHARS = 500;

/** Backend calls that carry no user-facing `Task`: the per-backend "Test now" probe, and the removed
 *  "Describe your change" writer, kept so its old log rows still get a label. */
export const AUDIT_ONLY_TASKS = ['describe-change', 'backend-test'] as const;
/** The audit-only ids something still writes; a removed one reaches the filter only through an old entry. */
export const LIVE_AUDIT_ONLY_TASKS: readonly AuditTask[] = ['backend-test'];
export type AuditTask = Task | (typeof AUDIT_ONLY_TASKS)[number];
export const ALL_AUDIT_TASKS: readonly AuditTask[] = [...ALL_TASKS, ...AUDIT_ONLY_TASKS];
export const AUDIT_ONLY_TASK_LABELS: Record<(typeof AUDIT_ONLY_TASKS)[number], string> = {
  'describe-change': 'Describe your change',
  'backend-test': 'Backend test',
};

export interface AuditEntry {
  id: string;
  ts: number;
  /** A built-in, an audit-only id, or a custom task's id (kept after the task is deleted). */
  task: string;
  sourceLang: string;
  targetLang: string;
  backend: BackendId | 'auto' | 'unknown';
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  latencyMs: number;
  firstTokenMs?: number;
  /** What the backend reported for a finished request; absent on a cache hit, a failure, or no report. */
  inputTokens?: number;
  outputTokens?: number;
  cacheHit: boolean;
  error?: { code: string; message: string };
  confidence?: number;
  /** Router request id for correlation; absent on paths with no router request (backend test). */
  requestId?: string;
  /** Which surface asked for the request. Lets a side panel tell its own
   *  failure from a sibling window's. */
  surface?: AuditSurface;
  /** One block of a page translate; at most AUDIT_BATCH_CAP of these are kept. */
  batch?: true;
}

/** `content` covers the tooltip, inline replace and page translate — one content script serves all three. */
export type AuditSurface = 'content' | 'sidepanel' | 'popup' | 'options' | 'unknown';

interface AuditEnvelopeV1 {
  version: 1;
  entries: AuditEntry[];
}

/** Clamp a string to `max` chars; append a truncation marker so a future
 *  reader sees the boundary instead of silent corruption. */
export function clampField(value: string, max: number): string {
  if (value.length <= max) return value;
  const dropped = value.length - max;
  return `${value.slice(0, max)}...[truncated ${dropped} chars]`;
}

function applyClamps(entry: AuditEntry): AuditEntry {
  const hasError = entry.error !== undefined;
  const promptCap = hasError ? AUDIT_MAX_PROMPT_CHARS_WITH_ERROR : AUDIT_MAX_PROMPT_CHARS;
  const responseCap = hasError ? AUDIT_MAX_RESPONSE_CHARS_WITH_ERROR : AUDIT_MAX_RESPONSE_CHARS;
  const clamped: AuditEntry = {
    ...entry,
    systemPrompt: clampField(entry.systemPrompt, promptCap),
    userPrompt: clampField(entry.userPrompt, promptCap),
    response: clampField(entry.response, responseCap),
  };
  if (entry.error !== undefined) {
    clamped.error = {
      code: entry.error.code,
      message: clampField(entry.error.message, AUDIT_MAX_ERROR_MESSAGE_CHARS),
    };
  }
  return clamped;
}

function isAuditEntry(x: unknown): x is AuditEntry {
  if (x === null || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e['id'] === 'string' &&
    typeof e['ts'] === 'number' &&
    typeof e['task'] === 'string' &&
    typeof e['sourceLang'] === 'string' &&
    typeof e['targetLang'] === 'string' &&
    typeof e['backend'] === 'string' &&
    typeof e['model'] === 'string' &&
    typeof e['systemPrompt'] === 'string' &&
    typeof e['userPrompt'] === 'string' &&
    typeof e['response'] === 'string' &&
    typeof e['latencyMs'] === 'number' &&
    typeof e['cacheHit'] === 'boolean'
  );
}

/** One malformed entry drops alone; failing the whole envelope would empty the log and the next push would overwrite it. */
function decodeStored(raw: unknown): AuditEntry[] {
  if (raw === null || typeof raw !== 'object') return [];
  const r = raw as { version?: unknown; entries?: unknown };
  if (r.version !== 1 || !Array.isArray(r.entries)) return [];
  return r.entries.filter(isAuditEntry);
}

export async function readAuditLog(): Promise<readonly AuditEntry[]> {
  const out = await chrome.storage.local.get(STORAGE_KEY);
  const raw = (out as Record<string, unknown>)[STORAGE_KEY];
  return decodeStored(raw);
}

// Only the service worker writes the log; every other surface sends `audit:push` or `audit:clear`, so one in-process lock is enough.
const lock = makeAsyncLock();

// Drained by whichever lock turn runs first, so a 30-block page translate costs one read+write, not thirty.
let queued: AuditEntry[] = [];

// A request still running at a clear would otherwise write its text back after the user deleted the log.
let clearedAt = 0;

export function pushAuditEntry(entry: Omit<AuditEntry, 'id' | 'ts'>): Promise<void> {
  const now = Date.now();
  if (now - entry.latencyMs < clearedAt) return Promise.resolve();
  const stamped: AuditEntry = applyClamps({
    ...entry,
    id: uuid(),
    ts: now,
  });
  queued.push(stamped);
  return lock(async () => {
    if (queued.length === 0) return;
    const batch = [...queued].reverse();
    queued = [];
    const cur = await readAuditLog();
    let batchRows = 0;
    const trimmed: AuditEntry[] = [...batch, ...cur]
      .filter((e) => e.batch !== true || (batchRows += 1) <= AUDIT_BATCH_CAP)
      .slice(0, AUDIT_LOG_CAP);
    const envelope: AuditEnvelopeV1 = { version: 1, entries: trimmed };
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: envelope });
    } catch (e) {
      // The batch is already drained, so a rejection here would lose every row in it, not one.
      queued = [...batch.reverse(), ...queued].slice(-AUDIT_LOG_CAP);
      throw e;
    }
  }).then(() => {
    // After the lock, not inside: sendMessage's SW-wake cost would stall every queued pusher.
    broadcastAuditEntry(stamped);
    return undefined;
  });
}

/** Called from a page or content script; the service worker owns the read-modify-write. */
export function requestAuditEntry(entry: Omit<AuditEntry, 'id' | 'ts'>): void {
  try {
    void chrome.runtime.sendMessage({ kind: 'audit:push', entry }).catch(() => {});
  } catch {
    /* no extension context; the audit row is only diagnostic. */
  }
}

/** Best-effort fire-and-forget broadcast to subscribed surfaces (sidepanel
 *  Toaster). Error entries only — success rows would spam the toaster. */
function broadcastAuditEntry(stamped: AuditEntry): void {
  if (!stamped.error) return;
  // Only the fields the `audit:append` type declares: the whole entry would put up to 1000 chars of prompt and reply on the wire.
  const entry = {
    error: stamped.error,
    ...(stamped.requestId !== undefined ? { requestId: stamped.requestId } : {}),
    ...(stamped.surface !== undefined ? { surface: stamped.surface } : {}),
  };
  try {
    // Rejection (no listener, SW asleep) is the expected idle path — swallow.
    void chrome.runtime.sendMessage({ kind: 'audit:append', entry }).catch(() => {});
  } catch {
    /* SW asleep or no extension context; broadcast is best-effort. */
  }
}

export async function clearAuditLog(): Promise<void> {
  clearedAt = Date.now();
  // Same lock as pushAuditEntry, and the queue goes too, or a not-yet-drained push survives the clear.
  await lock(() => {
    queued = [];
    return chrome.storage.local.remove(STORAGE_KEY);
  });
}

export interface AuditExportMeta {
  extensionVersion: string;
  userAgent: string;
}

/** The header is what makes a user's export diagnosable: which build, which browser, when. */
export function exportAuditLogAsJson(log: readonly AuditEntry[], meta?: AuditExportMeta): string {
  return JSON.stringify(
    {
      egaAuditLog: {
        version: 1,
        exportedAt: new Date().toISOString(),
        ...meta,
        entries: log,
      },
    },
    null,
    2,
  );
}
