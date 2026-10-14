// A DOM regex has no AbortSignal, so a backtracking pattern can only be bounded by capping input and banning slow ones.

const SAFE_REGEX_INPUT_CAP = 1024;

const SAFE_REGEX_BAN_THRESHOLD_MS = 50;

const bannedRegexes = new Set<string>();

function banKey(pattern: string, flags: string): string {
  return `${pattern}\x01${flags}`;
}

interface SafeTestOptions {
  /** Override the input cap — tests only. */
  inputCap?: number;
  /** Override the ban threshold — tests only. */
  banThresholdMs?: number;
  /** Injectable clock — tests use fake timers that don't advance
   *  performance.now(); a test can supply `Date.now` or a stub. */
  now?: () => number;
  /** Tests pass their own set; the default is process-wide. */
  bannedSet?: Set<string>;
  /** Called once when a regex is banned. */
  onBan?: (reason: 'slow' | 'threw') => void;
}

/** Input cap for a detection pattern ega did not ship: polynomial backtracking grows with the input, and detection needs only the start. */
export const CUSTOM_PATTERN_INPUT_CAP = 256;

/** Non-empty matches of a user pattern, timed and banned like safeTest; 0 on any error. An empty match would count on every text. */
export function safeCount(
  pattern: string,
  flags: string,
  text: string,
  opts: SafeTestOptions = {},
): number {
  const cap = opts.inputCap ?? SAFE_REGEX_INPUT_CAP;
  const threshold = opts.banThresholdMs ?? SAFE_REGEX_BAN_THRESHOLD_MS;
  const now = opts.now ?? (() => performance.now());
  const set = opts.bannedSet ?? bannedRegexes;
  const key = banKey(pattern, flags);
  if (set.has(key)) return 0;
  const input = text.length > cap ? text.slice(0, cap) : text;
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  } catch {
    return 0;
  }
  const start = now();
  let hits = 0;
  try {
    for (const m of input.matchAll(re)) if (m[0].length > 0) hits++;
  } catch {
    set.add(key);
    opts.onBan?.('threw');
    return 0;
  }
  if (now() - start >= threshold) {
    set.add(key);
    opts.onBan?.('slow');
  }
  return hits;
}

/** regex.test on a user pattern: never throws, false on any error, and a slow pattern is banned for the process. */
export function safeTest(
  pattern: string,
  flags: string,
  text: string,
  opts: SafeTestOptions = {},
): boolean {
  const cap = opts.inputCap ?? SAFE_REGEX_INPUT_CAP;
  const threshold = opts.banThresholdMs ?? SAFE_REGEX_BAN_THRESHOLD_MS;
  const now = opts.now ?? (() => performance.now());
  const set = opts.bannedSet ?? bannedRegexes;
  const key = banKey(pattern, flags);
  if (set.has(key)) return false;
  const input = text.length > cap ? text.slice(0, cap) : text;
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    return false;
  }
  const start = now();
  let matched: boolean;
  try {
    matched = re.test(input);
  } catch {
    set.add(key);
    opts.onBan?.('threw');
    return false;
  }
  const elapsed = now() - start;
  if (elapsed >= threshold) {
    set.add(key);
    opts.onBan?.('slow');
    return matched;
  }
  return matched;
}
