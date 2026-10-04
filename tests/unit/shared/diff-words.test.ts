import { describe, it, expect, vi, afterEach } from 'vitest';
import { diffWords } from '@/shared/diff-words';
import { setLogLevel } from '@/shared/logger';

describe('diffWords', () => {
  it('returns all-add when prior is empty', () => {
    const ops = diffWords('', 'hello world');
    expect(ops).toEqual([{ kind: 'add', text: 'hello world' }]);
  });

  it('returns all-del when next is empty', () => {
    const ops = diffWords('hello world', '');
    expect(ops).toEqual([{ kind: 'del', text: 'hello world' }]);
  });

  it('returns single eq when texts are identical', () => {
    const ops = diffWords('hello world', 'hello world');
    expect(ops).toEqual([{ kind: 'eq', text: 'hello world' }]);
  });

  it('returns empty list when both inputs are empty', () => {
    expect(diffWords('', '')).toEqual([]);
  });

  it('renders a middle replacement as eq+del+add+eq', () => {
    const ops = diffWords('the quick fox', 'the slow fox');
    // Whitespace tokens preserve word boundaries; the diff should keep
    // "the " + "fox" unchanged and swap the middle word.
    const kinds = ops.map((o) => o.kind);
    expect(kinds).toContain('eq');
    expect(kinds).toContain('del');
    expect(kinds).toContain('add');
    // Reconstructing add+eq must equal next; del+eq must equal prior.
    const reconstructedNext = ops
      .filter((o) => o.kind !== 'del')
      .map((o) => o.text)
      .join('');
    const reconstructedPrior = ops
      .filter((o) => o.kind !== 'add')
      .map((o) => o.text)
      .join('');
    expect(reconstructedNext).toBe('the slow fox');
    expect(reconstructedPrior).toBe('the quick fox');
  });

  it('tokenizes punctuation as separate tokens', () => {
    const ops = diffWords('hello, world.', 'hello! world.');
    // ", " differs from "! " — diff should isolate the punctuation swap
    // and keep "hello" / " world." intact.
    const reconstructedPrior = ops
      .filter((o) => o.kind !== 'add')
      .map((o) => o.text)
      .join('');
    const reconstructedNext = ops
      .filter((o) => o.kind !== 'del')
      .map((o) => o.text)
      .join('');
    expect(reconstructedPrior).toBe('hello, world.');
    expect(reconstructedNext).toBe('hello! world.');
  });

  it('preserves whitespace as eq tokens around changes', () => {
    const ops = diffWords('a b c', 'a x c');
    // Whitespace before/after the swap stays eq, the inner token flips.
    const eqTexts = ops.filter((o) => o.kind === 'eq').map((o) => o.text);
    expect(eqTexts.some((t) => t.includes('a'))).toBe(true);
    expect(eqTexts.some((t) => t.includes('c'))).toBe(true);
  });

  it('handles Hebrew (RTL) text without crashing', () => {
    const prior = 'שלום עולם';
    const next = 'שלום חברים';
    const ops = diffWords(prior, next);
    const reconstructedPrior = ops
      .filter((o) => o.kind !== 'add')
      .map((o) => o.text)
      .join('');
    const reconstructedNext = ops
      .filter((o) => o.kind !== 'del')
      .map((o) => o.text)
      .join('');
    expect(reconstructedPrior).toBe(prior);
    expect(reconstructedNext).toBe(next);
  });

  it('handles Arabic (RTL) text without crashing', () => {
    const prior = 'مرحبا بالعالم';
    const next = 'مرحبا بكم';
    const ops = diffWords(prior, next);
    const reconstructedPrior = ops
      .filter((o) => o.kind !== 'add')
      .map((o) => o.text)
      .join('');
    const reconstructedNext = ops
      .filter((o) => o.kind !== 'del')
      .map((o) => o.text)
      .join('');
    expect(reconstructedPrior).toBe(prior);
    expect(reconstructedNext).toBe(next);
  });

  it('treats append as trailing add only', () => {
    const ops = diffWords('hello', 'hello world');
    // First op is the unchanged "hello"; trailing add is the rest.
    expect(ops[0]).toEqual({ kind: 'eq', text: 'hello' });
    const adds = ops.filter((o) => o.kind === 'add');
    expect(adds.length).toBeGreaterThan(0);
    const reconstructedNext = ops
      .filter((o) => o.kind !== 'del')
      .map((o) => o.text)
      .join('');
    expect(reconstructedNext).toBe('hello world');
  });

  it('treats prefix removal as leading del only', () => {
    const ops = diffWords('hello world', 'world');
    const reconstructedPrior = ops
      .filter((o) => o.kind !== 'add')
      .map((o) => o.text)
      .join('');
    const reconstructedNext = ops
      .filter((o) => o.kind !== 'del')
      .map((o) => o.text)
      .join('');
    expect(reconstructedPrior).toBe('hello world');
    expect(reconstructedNext).toBe('world');
    expect(ops.some((o) => o.kind === 'del')).toBe(true);
  });
});

describe('diffWords — allocation guard', () => {
  it('returns no ops instead of allocating an unbounded LCS table', () => {
    const a = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    const b = Array.from({ length: 2000 }, (_, i) => `x${i}`).join(' ');
    const t0 = Date.now();
    const ops = diffWords(a, b);
    expect(ops).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('still diffs normally just under the budget', () => {
    const a = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    const b = a.replace('w5 ', 'zz ');
    expect(diffWords(a, b).length).toBeGreaterThan(0);
  });

  afterEach(() => setLogLevel('warn'));

  it('logs a debug line when the cap bails, so the fallback is observable', () => {
    setLogLevel('debug');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const a = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    const b = Array.from({ length: 2000 }, (_, i) => `x${i}`).join(' ');
    expect(diffWords(a, b)).toEqual([]);
    expect(debugSpy).toHaveBeenCalledWith(
      '[ega:shared.diff-words]',
      expect.stringContaining('LCS cap'),
      expect.objectContaining({ priorTokens: expect.any(Number) as number }),
    );
    debugSpy.mockRestore();
  });
});

describe('diffWords — line granularity', () => {
  it('emits one op per line, not one per word', () => {
    const ops = diffWords('alpha one\nbeta two\ngamma', 'alpha one\nbeta THREE\ngamma', 'line');
    expect(ops.map((o) => o.kind)).toEqual(['eq', 'del', 'add', 'eq']);
    expect(ops[1]?.text).toBe('beta two\n');
    expect(ops[2]?.text).toBe('beta THREE\n');
  });

  it('keeps join("") a faithful rebuild of both inputs', () => {
    const prior = 'a\nb\nc\n';
    const next = 'a\nc\nd\n';
    const ops = diffWords(prior, next, 'line');
    const rebuiltPrior = ops
      .filter((o) => o.kind !== 'add')
      .map((o) => o.text)
      .join('');
    const rebuiltNext = ops
      .filter((o) => o.kind !== 'del')
      .map((o) => o.text)
      .join('');
    expect(rebuiltPrior).toBe(prior);
    expect(rebuiltNext).toBe(next);
  });

  it('does not merge two adjacent changed lines into one op', () => {
    const ops = diffWords('x\ny\n', 'p\nq\n', 'line');
    expect(ops.filter((o) => o.kind === 'del').length).toBe(2);
    expect(ops.filter((o) => o.kind === 'add').length).toBe(2);
  });

  it('applies the same allocation cap as word mode', () => {
    const a = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n');
    const b = Array.from({ length: 2000 }, (_, i) => `other ${i}`).join('\n');
    expect(diffWords(a, b, 'line')).toEqual([]);
  });
});

describe('diffWords — line granularity, one-sided input', () => {
  it('adds each line of a from-empty template separately', () => {
    const ops = diffWords('', 'one\ntwo\nthree', 'line');
    expect(ops.map((o) => o.kind)).toEqual(['add', 'add', 'add']);
    expect(ops.map((o) => o.text)).toEqual(['one\n', 'two\n', 'three']);
  });

  it('deletes each line of a to-empty template separately', () => {
    const ops = diffWords('one\ntwo', '', 'line');
    expect(ops.map((o) => o.kind)).toEqual(['del', 'del']);
  });

  it('marks every line equal when both sides match', () => {
    const ops = diffWords('one\ntwo', 'one\ntwo', 'line');
    expect(ops.map((o) => o.kind)).toEqual(['eq', 'eq']);
  });
});
