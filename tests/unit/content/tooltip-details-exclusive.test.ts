// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Tooltip from '@/content/Tooltip.svelte';
import type { ResultMeta } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

function handlers() {
  return {
    onclose: vi.fn(),
    oncancel: vi.fn(),
    onretry: vi.fn(),
    oncopy: vi.fn(),
    onexplain: vi.fn(),
    onopenoptions: vi.fn(),
  };
}

const meta: ResultMeta = {
  backendId: asBackendIdUnsafe('anthropic'),
  cacheHit: false,
  latencyMs: 250,
};

function mountBoth() {
  return render(Tooltip, {
    props: {
      tip: {
        srcText: 'hello',
        body: 'translation',
        loading: false,
        confidencePill: true,
        left: 10,
        top: 10,
        contextSent: { pageTitle: 'Example', pageUrl: 'https://example.test' },
        meta,
      },
      clickOutsideDismiss: true,
      showSource: false,
      ...handlers(),
    },
  });
}

describe('Tooltip — one details panel', () => {
  it('one button opens result data and what was sent together, and closes it again', async () => {
    const { container } = mountBoth();
    const btn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show details about this reply"]',
    );
    if (!btn) throw new Error('no details button');
    expect(container.querySelector('button[data-tooltip="Context"]')).toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-ega-inspector]')).toBeNull();
    await fireEvent.click(btn);
    const panel = container.querySelector('[data-ega-inspector]');
    expect(panel?.textContent).toContain('Anthropic');
    expect(panel?.querySelector('[data-ega-context-preview]')?.textContent).toContain('Example');
    const open = container.querySelector('button[aria-label="Hide details about this reply"]');
    expect(open?.getAttribute('aria-expanded')).toBe('true');
    if (!(open instanceof HTMLButtonElement)) throw new Error('no open button');
    await fireEvent.click(open);
    expect(container.querySelector('[data-ega-inspector]')).toBeNull();
  });
});

describe('Tooltip — scrollable detail wrapper', () => {
  it('puts the open details panel in a single .ega-tooltip-details container', async () => {
    const { container } = mountBoth();
    const btn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show details about this reply"]',
    );
    if (!btn) throw new Error('no details button');
    await fireEvent.click(btn);
    const wrap = container.querySelector('.ega-tooltip-details');
    expect(wrap).toBeTruthy();
    expect(wrap?.querySelector('[data-ega-context-preview]')).toBeTruthy();
  });

  it('tooltip.css caps .ega-tooltip-details at 45vh and scrolls it (not .tooltip)', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(
      path.resolve(process.cwd(), 'src/content/tooltip/tooltip.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.tooltip \.ega-tooltip-details\s*\{[^}]*max-height:\s*45vh[^}]*overflow-y:\s*auto/,
    );
  });
});
