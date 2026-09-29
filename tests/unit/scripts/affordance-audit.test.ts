// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computeDrift, auditExitCode, nextBaseline } from '../../../scripts/affordance-audit.js';

describe('computeDrift', () => {
  it('no drift when all uncovered markers are baselined', () => {
    const src = new Set(['data-ega-foo', 'data-ega-bar']);
    const spec = new Set(['data-ega-foo']);
    const baseline = ['data-ega-bar'];
    const { uncovered, newDrift, staleBaseline } = computeDrift(src, spec, baseline);
    expect(uncovered).toEqual(['data-ega-bar']);
    expect(newDrift).toEqual([]);
    expect(staleBaseline).toEqual([]);
  });

  it('new drift when uncovered marker is absent from baseline', () => {
    const src = new Set(['data-ega-foo', 'data-ega-new']);
    const spec = new Set(['data-ega-foo']);
    const baseline: string[] = [];
    const { newDrift } = computeDrift(src, spec, baseline);
    expect(newDrift).toEqual(['data-ega-new']);
  });

  it('covered marker (referenced by spec) never counts as drift', () => {
    const src = new Set(['data-ega-covered', 'data-ega-uncovered']);
    const spec = new Set(['data-ega-covered']);
    const baseline: string[] = [];
    const { uncovered, newDrift } = computeDrift(src, spec, baseline);
    expect(uncovered).not.toContain('data-ega-covered');
    expect(newDrift).not.toContain('data-ega-covered');
    expect(newDrift).toContain('data-ega-uncovered');
  });

  it('stale baseline contains markers now covered', () => {
    const src = new Set(['data-ega-foo', 'data-ega-bar']);
    const spec = new Set(['data-ega-foo', 'data-ega-bar']);
    const baseline = ['data-ega-bar'];
    const { staleBaseline } = computeDrift(src, spec, baseline);
    expect(staleBaseline).toContain('data-ega-bar');
  });

  it('stale baseline contains markers removed from src', () => {
    const src = new Set(['data-ega-foo']);
    const spec = new Set<string>();
    const baseline = ['data-ega-foo', 'data-ega-gone'];
    const { staleBaseline } = computeDrift(src, spec, baseline);
    expect(staleBaseline).toContain('data-ega-gone');
  });

  it('empty src, spec, and baseline → all empty', () => {
    const result = computeDrift(new Set(), new Set(), []);
    expect(result.uncovered).toEqual([]);
    expect(result.newDrift).toEqual([]);
    expect(result.staleBaseline).toEqual([]);
  });

  it('handles data-testid markers alongside data-ega-* markers', () => {
    const src = new Set(['data-ega-foo', 'data-testid="my-widget"']);
    const spec = new Set(['data-ega-foo']);
    const baseline: string[] = [];
    const { newDrift } = computeDrift(src, spec, baseline);
    expect(newDrift).toContain('data-testid="my-widget"');
  });
});

describe('nextBaseline — the fix path cannot accept new drift', () => {
  it('prune drops entries that no longer drift and never adds a new one', () => {
    const next = nextBaseline(
      'prune',
      ['data-ega-old', 'data-ega-new'],
      ['data-ega-old', 'data-ega-covered'],
    );
    expect(next).toEqual(['data-ega-old']);
  });

  it('accept freezes the whole uncovered set, new drift included', () => {
    const next = nextBaseline('accept', ['data-ega-old', 'data-ega-new'], ['data-ega-old']);
    expect(next).toEqual(['data-ega-new', 'data-ega-old']);
  });

  it('prune on a clean tree leaves the baseline alone', () => {
    expect(nextBaseline('prune', ['data-ega-old'], ['data-ega-old'])).toEqual(['data-ega-old']);
  });
});

describe('auditExitCode — the baseline ratchet', () => {
  it('passes when the baseline matches the uncovered set exactly', () => {
    expect(auditExitCode({ newDrift: [], staleBaseline: [] })).toBe(0);
  });

  it('fails on a marker added to src with no flow and no baseline entry', () => {
    expect(auditExitCode({ newDrift: ['data-ega-new'], staleBaseline: [] })).toBe(1);
  });

  it('fails on a baseline entry that is now covered, so the baseline cannot grow stale', () => {
    expect(auditExitCode({ newDrift: [], staleBaseline: ['data-ega-now-covered'] })).toBe(1);
  });
});
