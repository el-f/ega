import { STORAGE_KEYS } from './constants';
import { onStoredChange } from './stored-changes';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

// A level emits every entry at or below its index: silent emits nothing, debug emits everything.
const ORDER: readonly LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];

let currentLevel: LogLevel = 'warn';
let initialized = false;

/** The one field, read raw: the storage reader imports the backend registry, which imports this logger. */
function levelOf(stored: unknown): LogLevel | undefined {
  const advanced = (stored as { advanced?: { debugLogLevel?: unknown } } | undefined)?.advanced;
  const level = advanced?.debugLogLevel;
  return ORDER.includes(level as LogLevel) ? (level as LogLevel) : undefined;
}

// A content script never gets here: it sets the level first, so its renderer never reads the settings row.
function initLevel(): void {
  if (initialized) return;
  initialized = true;
  try {
    const key = STORAGE_KEYS.settings;
    chrome.storage.local
      .get(key)
      .then((r) => {
        currentLevel = levelOf(r[key]) ?? currentLevel;
      })
      .catch(() => {});
    onStoredChange((changes) => {
      if (!(key in changes)) return;
      currentLevel = levelOf(changes[key].newValue) ?? 'warn';
    });
  } catch {
    // No chrome.storage here: the level stays at the default.
  }
}

function shouldLog(at: LogLevel): boolean {
  return ORDER.indexOf(at) <= ORDER.indexOf(currentLevel);
}

/** Sets the level without waiting on storage. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
  initialized = true;
}

/** Each level uses the matching console method so DevTools severity filtering works. */
export function createLogger(scope: string): Logger {
  initLevel();
  const tag = `[ega:${scope}]`;
  return {
    debug: (...a) => {
      if (shouldLog('debug')) console.debug(tag, ...a);
    },
    info: (...a) => {
      if (shouldLog('info')) console.info(tag, ...a);
    },
    warn: (...a) => {
      if (shouldLog('warn')) console.warn(tag, ...a);
    },
    error: (...a) => {
      if (shouldLog('error')) console.error(tag, ...a);
    },
  };
}

/** Breadcrumb for a swallowed error: no rethrow, no UI effect, and silent unless the level is `debug`. */
export function debugCatch(err: unknown, context?: string): void {
  initLevel();
  if (!shouldLog('debug')) return;
  const tag = context ? `[ega:catch:${context}]` : '[ega:catch]';
  if (err instanceof Error) console.debug(tag, err.name, err.message);
  else console.debug(tag, err);
}
