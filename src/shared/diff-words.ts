import { createLogger } from '@/shared/logger';

export type DiffOp =
  { kind: 'eq'; text: string } | { kind: 'add'; text: string } | { kind: 'del'; text: string };

const PUNCT_RE = /[\p{P}\p{S}]/u;

export type DiffGranularity = 'word' | 'line';

/** Each line keeps its newline, so `.join('')` still rebuilds the input. */
function tokeniseLines(s: string): string[] {
  const lines = s.split('\n');
  return lines.map((l, i) => (i === lines.length - 1 ? l : `${l}\n`)).filter((l) => l !== '');
}

/** Whitespace and punctuation become their own tokens, so `.join('')` rebuilds the input. */
function tokenise(s: string): string[] {
  if (s.length === 0) return [];
  const out: string[] = [];
  let buf = '';
  let mode: 'word' | 'space' | 'punct' = 'word';
  for (const ch of s) {
    const isSpace = /\s/.test(ch);
    const isPunct = !isSpace && PUNCT_RE.test(ch);
    const next: 'word' | 'space' | 'punct' = isSpace ? 'space' : isPunct ? 'punct' : 'word';
    if (buf.length === 0) {
      buf = ch;
      mode = next;
      continue;
    }
    // One token per punctuation char, so swapping ',' for '!' leaves nearby words alone.
    if (next !== mode || mode === 'punct') {
      out.push(buf);
      buf = ch;
      mode = next;
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

// The `?? 0` in cell() is for noUncheckedIndexedAccess only; the table is never read past its end.
function buildLcsTable(a: readonly string[], b: readonly string[]): Int32Array {
  const n = a.length;
  const m = b.length;
  const cols = m + 1;
  const table = new Int32Array((n + 1) * cols);
  const cell = (idx: number): number => table[idx] ?? 0;
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    const rowBase = i * cols;
    const prevBase = (i - 1) * cols;
    for (let j = 1; j <= m; j++) {
      if (ai === b[j - 1]) {
        table[rowBase + j] = cell(prevBase + j - 1) + 1;
      } else {
        const up = cell(prevBase + j);
        const left = cell(rowBase + j - 1);
        table[rowBase + j] = up > left ? up : left;
      }
    }
  }
  return table;
}

function walkBack(a: readonly string[], b: readonly string[], table: Int32Array): DiffOp[] {
  let i = a.length;
  let j = b.length;
  const cols = b.length + 1;
  const cell = (idx: number): number => table[idx] ?? 0;
  const reversed: DiffOp[] = [];
  while (i > 0 || j > 0) {
    const ai = i > 0 ? a[i - 1] : undefined;
    const bj = j > 0 ? b[j - 1] : undefined;
    if (i > 0 && j > 0 && ai === bj && ai !== undefined) {
      reversed.push({ kind: 'eq', text: ai });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || cell(i * cols + (j - 1)) >= cell((i - 1) * cols + j))) {
      if (bj !== undefined) reversed.push({ kind: 'add', text: bj });
      j--;
    } else if (ai !== undefined) {
      reversed.push({ kind: 'del', text: ai });
      i--;
    } else {
      break;
    }
  }
  return reversed.reverse();
}

/** Merge adjacent same-kind ops so the renderer emits one span per run. */
function coalesce(ops: readonly DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last?.kind === op.kind) {
      last.text += op.text;
    } else {
      out.push({ kind: op.kind, text: op.text });
    }
  }
  return out;
}

/** About 8 MB of Int32 cells; past this both callers fall back to plain text. */
const MAX_LCS_CELLS = 2_000_000;

const log = createLogger('shared.diff-words');

/**
 * LCS diff over words (default) or whole lines. Bounded: when the token grid
 * exceeds MAX_LCS_CELLS (~1400×1400 tokens), it returns [] and callers render
 * plain text instead. Line mode leaves each line its own op so a caller can
 * prefix it with `+` / `-`.
 */
export function diffWords(
  prior: string,
  next: string,
  granularity: DiffGranularity = 'word',
): DiffOp[] {
  const byLine = granularity === 'line';
  if (prior === '' && next === '') return [];
  // Line mode skips the scalar shortcuts so a whole-file add still lands one op per line.
  if (!byLine) {
    if (prior === '') return [{ kind: 'add', text: next }];
    if (next === '') return [{ kind: 'del', text: prior }];
    if (prior === next) return [{ kind: 'eq', text: prior }];
  }
  const a = byLine ? tokeniseLines(prior) : tokenise(prior);
  const b = byLine ? tokeniseLines(next) : tokenise(next);
  if ((a.length + 1) * (b.length + 1) > MAX_LCS_CELLS) {
    log.debug('LCS cap hit — rendering plain text', {
      priorTokens: a.length,
      nextTokens: b.length,
    });
    return [];
  }
  const table = buildLcsTable(a, b);
  const raw = walkBack(a, b, table);
  return byLine ? raw : coalesce(raw);
}
