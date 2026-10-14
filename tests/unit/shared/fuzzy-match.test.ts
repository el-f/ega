import { describe, it, expect } from 'vitest';
import { fuzzyMatch, rankMatches } from '@/shared/fuzzy-match';

function ok<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('expected a value');
  return v;
}

describe('fuzzyMatch', () => {
  it('empty query returns neutral hit so callers can show the whole list', () => {
    const hit = ok(fuzzyMatch('', 'anything'));
    expect(hit.score).toBe(0.5);
    expect(hit.matches).toEqual([]);
  });

  it('exact prefix scores 1.0', () => {
    const hit = ok(fuzzyMatch('open', 'Open Options'));
    expect(hit.score).toBe(1);
    expect(hit.matches).toEqual([0, 1, 2, 3]);
  });

  it('case-insensitive prefix still scores 1.0', () => {
    const hit = ok(fuzzyMatch('OPEN', 'open options'));
    expect(hit.score).toBe(1);
  });

  it('subsequence hit scores below prefix but above zero', () => {
    const hit = ok(fuzzyMatch('oopt', 'Open Options'));
    expect(hit.score).toBeGreaterThan(0);
    expect(hit.score).toBeLessThan(1);
  });

  it('word-boundary landings beat mid-word landings at the same density', () => {
    const boundary = ok(fuzzyMatch('ot', 'open tab'));
    const midword = ok(fuzzyMatch('ot', 'opxxxxxtab'));
    expect(boundary.score).toBeGreaterThan(midword.score);
  });

  it('missing char returns null', () => {
    expect(fuzzyMatch('xyz', 'Open Options')).toBeNull();
  });

  it('char-order matters: reversed subsequence is null', () => {
    expect(fuzzyMatch('snoitpo', 'Open Options')).toBeNull();
  });

  it('records matched char indices', () => {
    const hit = ok(fuzzyMatch('opt', 'open tab'));
    expect(hit.matches.length).toBe(3);
  });
});

describe('rankMatches', () => {
  it('filters out non-matching items and sorts by score descending', () => {
    const items = [
      { label: 'Switch theme: dark' },
      { label: 'Open Options' },
      { label: 'Selection bubble: smart' },
      { label: 'Translate with task: grammar' },
    ];
    const ranked = rankMatches('open', items, (i) => i.label);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ok(ranked[0]).label).toBe('Open Options');
    for (let i = 1; i < ranked.length; i++) {
      const prev = ok(ranked[i - 1]);
      const curr = ok(ranked[i]);
      expect(prev._score).toBeGreaterThanOrEqual(curr._score);
    }
  });

  it('ranking is stable across permutation — same input set yields same top hit', () => {
    const a = [{ k: 'Open Options' }, { k: 'Switch theme: dark' }];
    const b = [{ k: 'Switch theme: dark' }, { k: 'Open Options' }];
    expect(ok(rankMatches('open', a, (i) => i.k)[0]).k).toBe('Open Options');
    expect(ok(rankMatches('open', b, (i) => i.k)[0]).k).toBe('Open Options');
  });

  it('empty query returns every item with the neutral score', () => {
    const items = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
    const ranked = rankMatches('', items, (i) => i.k);
    expect(ranked.length).toBe(3);
    for (const r of ranked) expect(r._score).toBe(0.5);
  });

  it('nothing matches → empty array, not null', () => {
    const items = [{ k: 'alpha' }, { k: 'beta' }];
    expect(rankMatches('zzz', items, (i) => i.k)).toEqual([]);
  });
});
