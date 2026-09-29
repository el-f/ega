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

describe('Tooltip — context/inspector mutual exclusivity', () => {
  it('opening inspector closes context, and vice versa', async () => {
    const { container } = mountBoth();
    const ctxBtn = container.querySelector('button[aria-expanded][data-tooltip="Context"]');
    const inspBtn = container.querySelector('button[aria-label="Show inspector"]');
    expect(ctxBtn).toBeTruthy();
    expect(inspBtn).toBeTruthy();
    if (!ctxBtn || !inspBtn) throw new Error('toggle buttons missing');

    // Open context.
    await fireEvent.click(ctxBtn);
    expect(ctxBtn.getAttribute('aria-expanded')).toBe('true');

    // Open inspector — context must close.
    const inspBtnNow =
      container.querySelector('button[aria-label="Hide inspector"]') ??
      container.querySelector('button[aria-label="Show inspector"]');
    if (!inspBtnNow) throw new Error('inspector toggle missing');
    await fireEvent.click(inspBtnNow);
    const inspExpanded = container.querySelector('button[aria-label="Hide inspector"]');
    expect(inspExpanded).toBeTruthy();
    expect(inspExpanded?.getAttribute('aria-expanded')).toBe('true');
    const ctxAfter = container.querySelector('button[data-tooltip="Context"]');
    expect(ctxAfter?.getAttribute('aria-expanded')).toBe('false');

    // Re-open context — inspector must close.
    if (!ctxAfter) throw new Error('context toggle missing after inspector open');
    await fireEvent.click(ctxAfter);
    const ctxReopened =
      container.querySelector('button[data-tooltip="Hide context"]') ??
      container.querySelector('button[aria-expanded]');
    expect(
      container
        .querySelector('button[aria-label="Hide what was sent"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(container.querySelector('button[aria-label="Show inspector"]')).toBeTruthy();
    void ctxReopened;
  });
});

describe('Tooltip — scrollable detail wrapper', () => {
  it('wraps the preview + inspector in a single .ega-tooltip-details container', () => {
    const { container } = mountBoth();
    const wrap = container.querySelector('.ega-tooltip-details');
    expect(wrap).toBeTruthy();
    expect(wrap?.querySelector('[data-ega-context-preview]')).toBeTruthy();
  });

  it('styles.css caps .ega-tooltip-details and scrolls it (not .tooltip)', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/content/styles.css'), 'utf8');
    expect(css).toMatch(
      /\.tooltip \.ega-tooltip-details\s*\{[^}]*max-height:\s*50vh[^}]*overflow-y:\s*auto/,
    );
  });
});
