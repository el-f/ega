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

const BRACE_QUANTIFIER = /^\{\d+(?:,\d*)?\}/;

/** The same atom repeated twice in a row (`\w*\w*`, `.*.+`): each split of the input is a backtracking path. */
const ADJACENT_SAME_REPEAT = /(\\.|\[(?:\\.|[^\]\\])*\]|[^\\[\]()|*+?{}])[*+]\??\1[*+]/;

/** True for the shapes whose backtracking grows exponentially with the input: a repeat over a group that holds a quantifier, an unbounded repeat over an alternation with a wide atom (`(\w|\d)+`), and one atom repeated twice in a row. Best effort, so `(a|aa)+` passes. */
export function hasNestedQuantifier(pattern: string): boolean {
  if (ADJACENT_SAME_REPEAT.test(pattern)) return true;
  // One flag per open group: whether a quantifier appeared anywhere inside it.
  const groups: boolean[] = [];
  // Per open group: whether it holds a top-level alternation, and whether it holds a wide atom (\w, \d, ., a class).
  const alts: boolean[] = [];
  const wides: boolean[] = [];
  let closedGroupHadQuantifier = false;
  let closedGroupHadAlt = false;
  let closedGroupWide = false;
  const markWide = (): void => {
    if (wides.length > 0) wides[wides.length - 1] = true;
  };
  let afterGroupClose = false;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      if (/[wds]/i.test(pattern[i + 1] ?? '')) markWide();
      i++;
      afterGroupClose = false;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      markWide();
      inClass = true;
      afterGroupClose = false;
      continue;
    }
    if (ch === '|' && alts.length > 0) {
      alts[alts.length - 1] = true;
      afterGroupClose = false;
      continue;
    }
    if (ch === '(') {
      groups.push(false);
      alts.push(false);
      wides.push(false);
      // The `?` of `(?:`, `(?=` and `(?<name>` is syntax, not a quantifier.
      if (pattern[i + 1] === '?') i++;
      afterGroupClose = false;
      continue;
    }
    if (ch === ')') {
      closedGroupHadQuantifier = groups.pop() ?? false;
      closedGroupHadAlt = alts.pop() ?? false;
      closedGroupWide = wides.pop() ?? false;
      if (closedGroupWide) markWide();
      afterGroupClose = true;
      continue;
    }
    if (ch === '.') markWide();
    const brace = ch === '{' ? BRACE_QUANTIFIER.exec(pattern.slice(i)) : null;
    const isQuantifier = ch === '*' || ch === '+' || ch === '?' || brace !== null;
    if (!isQuantifier) {
      afterGroupClose = false;
      continue;
    }
    if (afterGroupClose && closedGroupHadQuantifier && ch !== '?') return true;
    const unbounded = ch === '*' || ch === '+' || (brace !== null && /,\}$/.test(brace[0]));
    if (afterGroupClose && closedGroupHadAlt && closedGroupWide && unbounded) return true;
    groups.fill(true);
    if (brace) i += brace[0].length - 1;
    afterGroupClose = false;
  }
  return false;
}

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
