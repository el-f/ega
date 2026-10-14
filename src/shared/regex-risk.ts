// Checks run where a detection pattern is saved, imported or read from storage, never on a page: kept out of safe-regex.ts, which every page loads.
import { CUSTOM_PATTERN_INPUT_CAP } from './safe-regex';

const BRACE_QUANTIFIER = /^\{\d+(?:,\d*)?\}/;

/** The same atom repeated twice in a row (`\w*\w*`, `.*.+`): each split of the input is a backtracking path. */
const ADJACENT_SAME_REPEAT = /(\\.|\[(?:\\.|[^\]\\])*\]|[^\\[\]()|*+?{}])[*+]\??\1[*+]/;

// Measured on V8: 24 optional atoms in a row before a counted repeat take 35 ms to compile, 28 take 130 ms.
const MAX_OPTIONAL_RUN = 12;

interface Frame {
  run: number;
  allOpt: boolean;
  emptyAlt: boolean;
}

/** True when more than 12 atoms in a row are each optional (`a?`, `a{0,2}`, or a group that can match nothing, like `(?:a?)`): V8's compile time grows fast with that run, and the first match compiles. A `*` atom compiles cheaply and does not count. */
export function hasLongOptionalRun(pattern: string): boolean {
  // One frame per open group: the current run, whether every atom so far in this alternative is optional, and whether an earlier alternative was.
  const frames: Frame[] = [{ run: 0, allOpt: true, emptyAlt: false }];
  let i = 0;
  // The root frame is never popped, so the stack is never empty.
  const top = (): Frame => frames[frames.length - 1] as Frame;
  const countAtom = (optional: boolean): void => {
    const f = top();
    if (optional) {
      f.run++;
      if (f.run > MAX_OPTIONAL_RUN) throw new Error('long run');
    } else {
      f.run = 0;
      f.allOpt = false;
    }
  };
  // After an atom: read its quantifier, if any, and count the atom; `emptyable` is a group that can match nothing on its own.
  const atomEnd = (emptyable = false): void => {
    const q = pattern[i];
    if (q === '?') {
      i++;
      if (pattern[i] === '?') i++;
      countAtom(true);
      return;
    }
    if (q === '{') {
      const brace = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(i));
      if (brace) {
        i += brace[0].length;
        if (pattern[i] === '?') i++;
        // A minimum of 0 with a finite maximum is optional; {0,} is a *.
        countAtom(brace[1] === '0' && brace[2] !== '');
        return;
      }
    }
    if (q === '*' || q === '+') {
      i++;
      if (pattern[i] === '?') i++;
      countAtom(false);
      return;
    }
    countAtom(emptyable);
  };
  try {
    while (i < pattern.length) {
      const ch = pattern[i];
      if (ch === '\\') {
        const next = pattern[i + 1];
        i += 2;
        if ((next === 'p' || next === 'P' || next === 'u') && pattern[i] === '{') {
          const close = pattern.indexOf('}', i);
          i = close < 0 ? pattern.length : close + 1;
        } else if (next === 'k' && pattern[i] === '<') {
          const close = pattern.indexOf('>', i);
          i = close < 0 ? pattern.length : close + 1;
        }
        atomEnd();
      } else if (ch === '[') {
        i++;
        while (i < pattern.length && pattern[i] !== ']') i += pattern[i] === '\\' ? 2 : 1;
        i++;
        atomEnd();
      } else if (ch === '(') {
        i++;
        if (pattern[i] === '?') {
          i++;
          if (pattern[i] === '<' && pattern[i + 1] !== '=' && pattern[i + 1] !== '!') {
            i = pattern.indexOf('>', i) + 1 || pattern.length;
          } else i += pattern[i] === '<' ? 2 : 1;
        }
        frames.push({ run: 0, allOpt: true, emptyAlt: false });
      } else if (ch === ')') {
        const closed = frames.length > 1 ? frames.pop() : undefined;
        i++;
        atomEnd(closed !== undefined && (closed.allOpt || closed.emptyAlt));
      } else if (ch === '|') {
        const f = top();
        f.emptyAlt = f.emptyAlt || f.allOpt;
        f.run = 0;
        f.allOpt = true;
        i++;
      } else {
        i++;
        atomEnd();
      }
    }
  } catch {
    return true;
  }
  return false;
}

/** A detection pattern ega refuses to store or run: exponential backtracking, or a compile that can hang. */
export function hasRiskyRepeat(pattern: string): boolean {
  return hasNestedQuantifier(pattern) || hasLongOptionalRun(pattern);
}

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

// Inputs that drive the usual backtracking shapes, cut to each probe length.
const SLOW_PROBE_TEXTS = [
  (n: number) => 'a'.repeat(n),
  (n: number) => 'a '.repeat(n).slice(0, n),
  (n: number) => 'ab1 '.repeat(n).slice(0, n),
  (n: number) => 'a'.repeat(n - 1) + '!',
  (n: number) => 'The quick brown fox, 7abibi 3la kifak? '.repeat(n).slice(0, n),
];
// One character a step to 32, then four: a step multiplies a backtracking cost by a bounded factor, so the check stops near 20 ms.
// ponytail: an n-way alternation can still cost about n x 20 ms on its last step; a Worker with terminate() is the upgrade.
const SLOW_PROBE_LENGTHS = [
  ...Array.from({ length: 32 }, (_, i) => i + 1),
  ...Array.from({ length: (CUSTOM_PATTERN_INPUT_CAP - 32) / 4 }, (_, i) => 36 + 4 * i),
];
const SLOW_PROBE_MS = 20;

/** True when a detection pattern nests a repeat, or spends more than 20 ms on any probe input up to the custom cap: checked where a pattern is saved or imported, never on a page. */
export function isSlowPattern(
  pattern: string,
  flags: string,
  now: () => number = () => performance.now(),
): boolean {
  if (hasRiskyRepeat(pattern)) return true;
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  } catch {
    return false;
  }
  for (const n of SLOW_PROBE_LENGTHS) {
    for (const text of SLOW_PROBE_TEXTS) {
      const input = text(n);
      const start = now();
      try {
        for (const _ of input.matchAll(re)) {
          // Drain the iterator; only the time counts.
        }
      } catch {
        return true;
      }
      if (now() - start > SLOW_PROBE_MS) return true;
    }
  }
  return false;
}
