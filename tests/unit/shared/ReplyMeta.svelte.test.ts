// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import ReplyMeta from '@/shared/components/ReplyMeta.svelte';

describe('ReplyMeta', () => {
  it('renders every item in order, in one left-to-right line', () => {
    const { container } = render(ReplyMeta, {
      props: {
        items: [
          { key: 'direction', text: 'Spanish → English' },
          { key: 'model', text: 'Claude Haiku 4.5' },
          { key: 'confidence', text: 'Low confidence (42%)', warn: true },
        ],
      },
    });
    const line = container.querySelector('[data-ega-reply-meta]');
    expect(line?.getAttribute('dir')).toBe('ltr');
    const items = Array.from(container.querySelectorAll('.ega-reply-meta-item'));
    expect(items.map((i) => i.textContent)).toEqual([
      'Spanish → English',
      'Claude Haiku 4.5',
      'Low confidence (42%)',
    ]);
    expect(items[2]?.classList.contains('warn')).toBe(true);
  });

  it('puts the status action inside the status item', async () => {
    const onclick = vi.fn();
    const { getByRole } = render(ReplyMeta, {
      props: {
        items: [{ key: 'status', text: 'Reading aloud' }],
        statusAction: { label: 'Stop', onclick },
      },
    });
    await fireEvent.click(getByRole('button', { name: 'Stop' }));
    expect(onclick).toHaveBeenCalledOnce();
  });

  // jsdom has no layout, so the one-line rules are pinned in the source; the e2e design checks measure them.
  it('clips to one line and draws the dots in CSS, never as text', () => {
    const src = readFileSync('src/shared/components/ReplyMeta.svelte', 'utf8');
    expect(src).toContain('block-size: 1lh');
    expect(src).toContain('overflow: hidden');
    expect(src).toContain('flex-wrap: wrap');
    // The dot goes with the item after it, so a hidden item takes its dot along.
    expect(src).toMatch(
      /\.ega-reply-meta-item:not\(:global\(\.ega-sr-only\)\)\s*~ \.ega-reply-meta-item:not\(:global\(\.ega-sr-only\)\)::before/,
    );
  });

  // Spec §1.3/§5.2: an item is never cut. It does not shrink or wrap inside itself; one that does not fit is hidden.
  it('never ends an item with an ellipsis, and never wraps one inside itself', () => {
    const src = readFileSync('src/shared/components/ReplyMeta.svelte', 'utf8');
    const item = /\.ega-reply-meta-item\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(item).not.toMatch(/text-overflow/);
    expect(item).toMatch(/flex-shrink:\s*0/);
    expect(item).toMatch(/white-space:\s*nowrap/);
  });

  // V5-03: "→ Chinese (Traditional)" showed as "→ Chinese". An item that does not fit whole is hidden whole.
  it('hides each item that does not fit whole on the line, and keeps it for screen readers', () => {
    const boxes: Record<string, Partial<DOMRect>> = {
      line: { top: 0, right: 200 },
      direction: { top: 0, right: 120 },
      model: { top: 18, right: 190 },
      confidence: { top: 0, right: 210 },
    };
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const key = this.hasAttribute('data-ega-reply-meta')
          ? 'line'
          : (this.getAttribute('data-ega-meta-item') ?? '');
        return { top: 0, right: 0, ...boxes[key] } as DOMRect;
      });
    const { container } = render(ReplyMeta, {
      props: {
        items: [
          { key: 'direction', text: 'English → Chinese (Traditional)' },
          { key: 'model', text: 'Claude Haiku 4.5' },
          { key: 'confidence', text: '93% confident' },
        ],
      },
    });
    spy.mockRestore();
    const hidden = (key: string): boolean | undefined =>
      container.querySelector(`[data-ega-meta-item="${key}"]`)?.classList.contains('ega-sr-only');
    expect(hidden('direction')).toBe(false);
    // Wrapped to a second line, and past the right edge: both hidden whole, text still in the tree.
    expect(hidden('model')).toBe(true);
    expect(hidden('confidence')).toBe(true);
    expect(container.querySelector('[data-ega-meta-item="model"]')?.textContent).toBe(
      'Claude Haiku 4.5',
    );
  });

  // The 18px line clips everything outside it, so Stop's ring has to sit inside the button.
  it('draws Stop’s focus ring inside the one-line clip', () => {
    const src = readFileSync('src/shared/components/ReplyMeta.svelte', 'utf8');
    const ring = /\.ega-reply-meta-action:focus-visible\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(ring).toMatch(/outline:\s*2px solid var\(--color-accent\)/);
    expect(ring).toMatch(/outline-offset:\s*-2px/);
  });
});
