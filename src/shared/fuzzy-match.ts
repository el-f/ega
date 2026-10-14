export interface FuzzyHit {
  readonly score: number;
  readonly matches: readonly number[];
}

export function fuzzyMatch(query: string, haystack: string): FuzzyHit | null {
  if (query === '') return { score: 0.5, matches: [] };
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();

  // Prefix shortcut — strongest signal.
  if (h.startsWith(q)) {
    return {
      score: 1,
      matches: Array.from({ length: q.length }, (_, i) => i),
    };
  }

  // Subsequence scan.
  const matches: number[] = [];
  let hi = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const qc = q[qi];
    if (qc === undefined) return null;
    while (hi < h.length && h[hi] !== qc) hi++;
    if (hi >= h.length) return null;
    matches.push(hi);
    hi++;
  }

  // Score: density of match positions within the matched span.
  const first = matches[0];
  const last = matches[matches.length - 1];
  if (first === undefined || last === undefined) return null;
  const span = last - first + 1;
  const density = q.length / span;

  // Word-boundary bonus: a match right after a separator, or at position 0.
  let boundaryHits = 0;
  for (const mi of matches) {
    if (mi === 0) {
      boundaryHits++;
      continue;
    }
    const prev = h[mi - 1];
    if (prev !== undefined && /[\s\-_/.]/.test(prev)) boundaryHits++;
  }
  const boundaryBonus = (boundaryHits / q.length) * 0.2;
  const score = Math.min(0.95, density * 0.8 + boundaryBonus);

  return { score, matches };
}

/** Ranks by score, drops non-matches; equal scores keep input order. */
export function rankMatches<T>(
  query: string,
  items: readonly T[],
  keyFn: (item: T) => string,
): Array<T & { _score: number; _matches: readonly number[] }> {
  const out: Array<T & { _score: number; _matches: readonly number[] }> = [];
  for (const item of items) {
    const hit = fuzzyMatch(query, keyFn(item));
    if (hit) out.push({ ...item, _score: hit.score, _matches: hit.matches });
  }
  out.sort((a, b) => b._score - a._score);
  return out;
}
