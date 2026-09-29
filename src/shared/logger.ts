// storage is imported inside initLevel — a top-level import closes the storage → registry → base → logger cycle and freezes backend constructors as undefined.

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

function initLevel(): void {
  if (initialized) return;
  initialized = true;
  void (async () => {
    try {
      const { getSettings, onSettingsChanged } = await import('./storage');
      const s = await getSettings();
      currentLevel = s.advanced.debugLogLevel;
      try {
        onSettingsChanged((s) => {
          currentLevel = s.advanced.debugLogLevel;
        });
      } catch {
        // chrome.storage.onChanged absent — level stays at the default.
      }
    } catch {
      // first-run / no-storage / dynamic-import-failure — default stays.
    }
  })();
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
