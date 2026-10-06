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
    expect(src).toMatch(/\.ega-reply-meta-item \+ \.ega-reply-meta-item::before/);
  });
});
