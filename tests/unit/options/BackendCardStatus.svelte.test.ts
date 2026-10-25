// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import BackendCardStatus from '@/options/components/backend-card/BackendCardStatus.svelte';

const base = {
  supportsImage: true,
  verifiedAt: null,
  testFailed: false,
  outdated: false,
  route: null,
  firstForImages: false,
};

const word = (c: HTMLElement): string | null =>
  c.querySelector('[data-ega-backend-status]')?.getAttribute('data-ega-backend-status') ?? null;

describe('BackendCardStatus vocabulary', () => {
  it.each([
    ['cloud', 'needs-config', {}, 'Needs setup'],
    ['cloud', 'ready', {}, 'Key saved'],
    ['cloud', 'ready', { verifiedAt: Date.now() - 2 * 3_600_000 }, 'Verified'],
    ['cloud', 'ready', { testFailed: true }, 'Test failed'],
    ['local', 'unknown', {}, 'Checking...'],
    ['local', 'ready', {}, 'Running'],
    ['local', 'unavailable', {}, 'Not running'],
    ['native', 'ready', {}, 'Installed'],
    ['native', 'ready', { outdated: true }, 'Update needed'],
    ['native', 'unavailable', {}, 'Not installed'],
  ] as const)('%s %s %o -> %s', (kind, beStatus, extra, expected) => {
    const { container } = render(BackendCardStatus, {
      props: { ...base, kind, beStatus, ...extra },
    });
    expect(word(container)).toBe(expected);
    // Every pill holds the width of every word any kind can show, so the route tag after it does not move and a
    // column of cards shows pills of one width (R63).
    const held = [...container.querySelectorAll('.be-pill-sizer')].map((s) =>
      s.getAttribute('data-label'),
    );
    expect(new Set(held)).toEqual(
      new Set([
        'Checking...',
        'Needs setup',
        'Test failed',
        'Verified',
        'Key saved',
        'Not installed',
        'Update needed',
        'Installed',
        'Running',
        'Not running',
      ]),
    );
    // The icon sits in the centered face with the word, so a short word leaves no gap on one side.
    expect(
      container.querySelector('.ega-stable > .be-pill-face > .be-pill-icon svg'),
    ).not.toBeNull();
    // One pill, no coloured dot.
    expect(container.querySelectorAll('[data-ega-backend-status]')).toHaveLength(1);
    expect(container.querySelector('.be-dot')).toBeNull();
  });

  it('Verified names how long ago the test passed, for a screen reader', () => {
    const { container } = render(BackendCardStatus, {
      props: { ...base, kind: 'cloud', beStatus: 'ready', verifiedAt: Date.now() - 2 * 3_600_000 },
    });
    expect(container.textContent.replace(/\s+/g, ' ')).toContain('Verified 2 hours ago');
  });

  it('route tags read First choice, Backup n, Skipped; "Text only" is plain text', () => {
    const { container, rerender } = render(BackendCardStatus, {
      props: {
        ...base,
        kind: 'cloud',
        beStatus: 'ready',
        route: { kind: 'first' },
        supportsImage: false,
      },
    });
    expect(container.querySelector('[data-ega-route]')?.textContent).toBe('First choice');
    expect(container.querySelector('.be-text-only')?.textContent).toBe('Text only');
    void rerender({ ...base, kind: 'cloud', beStatus: 'ready', route: { kind: 'backup', n: 2 } });
  });
});
