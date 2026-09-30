// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import Tooltip from '@/content/Tooltip.svelte';
import type { DetectedVariety, ErrCode } from '@/shared/types';
import type { Task } from '@/shared/task-prompts';

import type { ResultMeta } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { ensureCustomLanguages, resetCustomLanguagesCache } from '@/content/customs-cache';
import { upsertCustomLanguage } from '@/shared/storage';
import { preset } from '@tests/_helpers/lang';

interface TipState {
  srcText: string;
  body: string;
  loading: boolean;
  confidence?: number;
  confidencePill: boolean;
  detectedLang?: string;
  detectedDetail?: string;
  detectedLangs?: DetectedVariety[];
  explain?: string;
  error?: { code: ErrCode; message: string };
  copied?: boolean;
  left: number;
  top: number;
  task?: Task;
  meta?: ResultMeta;
  imageUrl?: string;
  retryBlocked?: boolean;
  loadingLabel?: string;
  settled?: boolean;
}

function baseTip(overrides: Partial<TipState> = {}): TipState {
  return {
    srcText: 'hello',
    body: '',
    loading: false,
    confidencePill: true,
    left: 10,
    top: 10,
    ...overrides,
  };
}

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

function mountWith(
  tipOverrides: Partial<TipState>,
  clickOutsideDismiss = true,
  showSource = false,
) {
  const h = handlers();
  const utils = render(Tooltip, {
    props: { tip: baseTip(tipOverrides), clickOutsideDismiss, showSource, ...h },
  });
  return { ...utils, ...h };
}

describe('Tooltip smoke', () => {
  it('does NOT show the source-text echo by default (showSource=false)', () => {
    const { container } = mountWith({ srcText: 'the-source-text-we-highlighted' });
    expect(container.textContent).not.toContain('the-source-text-we-highlighted');
  });

  it('shows the source-text echo when showSource=true', () => {
    const { container } = mountWith({ srcText: 'I-want-to-see-this' }, true, true);
    expect(container.textContent).toContain('I-want-to-see-this');
  });

  it('truncates the source-text echo past 140 chars (when shown)', () => {
    const long = 'x'.repeat(200);
    const { container } = mountWith({ srcText: long }, true, true);
    const src = container.querySelector('.src');
    expect(src?.textContent).toContain('…');
    expect(src?.textContent.length).toBeLessThan(160);
  });

  it('shows Cancel button while loading with no body', () => {
    const { getByText } = mountWith({ loading: true, body: '' });
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('keeps Cancel while the body streams, and drops it once the turn settles', () => {
    const hasCancel = (el: HTMLElement): boolean =>
      Array.from(el.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Cancel');

    const streaming = mountWith({ loading: false, body: 'half a sentence', settled: false });
    expect(hasCancel(streaming.container)).toBe(true);

    const done = mountWith({ loading: false, body: 'a whole sentence', settled: true });
    expect(hasCancel(done.container)).toBe(false);
  });

  it('pre-stream shimmer includes a "Translating..." label for clarity', () => {
    const { container } = mountWith({ body: '', loading: true });
    const label = container.textContent;
    expect(label).toMatch(/translat/i);
    expect(container.querySelector('.shimmer-wrap')).toBeTruthy();
    expect(container.querySelector('.shimmer')).toBeTruthy();
  });

  it('AUTH error hides Retry (terminal — same key would fail again) and shows the Open settings CTA', () => {
    const { container } = mountWith({ error: { code: 'AUTH', message: 'bad key' } });
    expect(container.querySelector('button[aria-label="Retry"]')).toBeNull();
    const cta = container.querySelector('[data-ega-tooltip-error-cta]');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Open settings');
  });

  it('QUOTA error hides Retry too (mirrors the sidepanel gate)', () => {
    const { container } = mountWith({ error: { code: 'QUOTA', message: 'over limit' } });
    expect(container.querySelector('button[aria-label="Retry"]')).toBeNull();
  });

  it.each(['NETWORK', 'SERVER', 'RATE_LIMIT', 'TIMEOUT'] as const)(
    'retryable %s error keeps Retry',
    (code) => {
      const { container } = mountWith({ error: { code, message: 'transient' } });
      expect(container.querySelector('button[aria-label="Retry"]')).toBeTruthy();
    },
  );

  it('ABORTED (user cancel) keeps Retry — re-running is the natural recovery', () => {
    const { container } = mountWith({ error: { code: 'ABORTED', message: 'canceled' } });
    expect(container.querySelector('button[aria-label="Retry"]')).toBeTruthy();
  });

  it('does not show the Open settings CTA on NETWORK error', () => {
    const { container } = mountWith({
      error: { code: 'NETWORK', message: 'offline' },
    });
    expect(container.querySelector('button[aria-label="Retry"]')).toBeTruthy();
    expect(container.querySelector('[data-ega-tooltip-error-cta]')).toBeNull();
  });

  it('error row has exactly one affordance for the settings destination (no gear icon)', () => {
    const { container } = mountWith({ error: { code: 'AUTH', message: 'bad key' } });
    expect(container.querySelector('button[aria-label="Open settings"]')).toBeNull();
    expect(container.querySelectorAll('[data-ega-tooltip-error-cta]').length).toBe(1);
  });

  it('retryBlocked disables the error-row Retry button', () => {
    const h = handlers();
    const { container } = render(Tooltip, {
      props: {
        tip: {
          ...baseTip({ error: { code: 'RATE_LIMIT', message: 'slow down' } }),
          retryBlocked: true,
        },
        clickOutsideDismiss: true,
        showSource: false,
        ...h,
      },
    });
    const retry = container.querySelector<HTMLButtonElement>('button[aria-label="Retry"]');
    expect(retry).toBeTruthy();
    expect(retry?.hasAttribute('disabled')).toBe(true);
  });

  it('renders explain as a labeled block (not muted .src text)', () => {
    const { container } = mountWith({
      body: 'translation',
      explain: 'cultural context here',
    });
    const block = container.querySelector('.explain-block');
    expect(block).toBeTruthy();
    expect(block?.textContent).toContain('Context & subtext');
    expect(block?.textContent).toContain('cultural context here');
  });

  it('omits the explain block when explain is absent', () => {
    const { container } = mountWith({ body: 'translation' });
    expect(container.querySelector('.explain-block')).toBeNull();
  });

  it('fires onclose on Escape keydown', async () => {
    const { container, onclose } = mountWith({ body: 'hi' });
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    if (!dialog) throw new Error('no dialog');
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('detectedLang id is displayed as the pretty preset label', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'arabizi',
    });
    const meta = container.querySelector('.meta');
    expect(meta?.textContent).toContain('Arabizi');
    expect(meta?.textContent).not.toContain('arabizi');
  });

  it('unknown detectedLang (e.g. custom uuid or "other") passes through verbatim', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'custom-xyz',
    });
    const meta = container.querySelector('.meta');
    expect(meta?.textContent).toContain('custom-xyz');
  });

  it('detectedDetail renders as "Label — detail" next to the preset name', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine',
    });
    const meta = container.querySelector('.meta');
    // Em dash, not parens: detectedDetail can already carry parens.
    expect(meta?.textContent).toContain('Arabizi \u2014 Levantine');
  });

  it('detectedDetail with inner parens stays readable (no double-paren bug)', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine (Lebanese)',
    });
    const meta = container.querySelector('.meta');
    expect(meta?.textContent).not.toMatch(/\(\(/);
    expect(meta?.textContent).not.toMatch(/\)\)/);
    expect(meta?.textContent).toContain('Levantine (Lebanese)');
  });

  it('detectedDetail without detectedLang still shows (rare but possible)', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedDetail: 'looks like Venetian Italian',
    });
    const meta = container.querySelector('.meta');
    expect(meta?.textContent).toContain('Venetian Italian');
  });

  it('detectedLangs with >1 entries renders a pill cluster, NOT the single pill', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'arabizi',
      detectedLangs: [{ id: 'arabizi' }, { id: 'elvish-quenya', detail: 'high-elven' }],
    });
    const cluster = container.querySelector('[data-ega-multi-variety]');
    expect(cluster).toBeTruthy();
    if (!cluster) throw new Error('no cluster');
    const pills = cluster.querySelectorAll('.lang-pill');
    expect(pills.length).toBe(2);
    const p0 = pills[0];
    const p1 = pills[1];
    if (!p0 || !p1) throw new Error('expected 2 pills');
    expect(p0.textContent).toContain('Arabizi');
    expect(p1.textContent).toContain('Elvish');
    expect(p1.textContent).toContain('high-elven');
    expect(container.querySelector('.meta .lang')).toBeNull();
  });

  it('detectedLangs with a single entry falls through to the single-pill path', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'arabizi',
      detectedLangs: [{ id: 'arabizi' }],
    });
    expect(container.querySelector('[data-ega-multi-variety]')).toBeNull();
    expect(container.querySelector('.meta .lang')?.textContent).toContain('Arabizi');
  });

  it('action buttons carry aria-label without native title attr', () => {
    // A native title renders Chrome's own tooltip on top of the styled data-tooltip label.
    const { container } = mountWith({ body: 'hi' }, /* clickOutsideDismiss */ false);
    const copy = container.querySelector('button[aria-label="Copy translation"]');
    const explain = container.querySelector('button[aria-label="Explain this translation"]');
    const close = container.querySelector('button[aria-label="Close"]');
    expect(copy).toBeTruthy();
    expect(explain).toBeTruthy();
    expect(close).toBeTruthy();
    expect(copy?.getAttribute('title')).toBeNull();
    expect(explain?.getAttribute('title')).toBeNull();
    expect(close?.getAttribute('title')).toBeNull();
  });

  it('icon buttons carry data-tooltip for CSS hover label', () => {
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hi' }),
        // The close icon renders only when clickOutsideDismiss is false.
        clickOutsideDismiss: false,
        showSource: false,
        onswap: vi.fn(),
        ...handlers(),
      },
    });
    const copy = container.querySelector('button[aria-label="Copy translation"]');
    const explain = container.querySelector('button[aria-label="Explain this translation"]');
    const swap = container.querySelector('button[aria-label="Swap direction"]');
    const close = container.querySelector('button[aria-label="Close"]');
    expect(copy?.getAttribute('data-tooltip')).toBe('Copy');
    expect(explain?.getAttribute('data-tooltip')).toBe('Explain');
    expect(swap?.getAttribute('data-tooltip')).toBe('Swap');
    expect(close?.getAttribute('data-tooltip')).toBe('Close (Esc)');
  });

  it('copied state flips the copy button data-tooltip to "Copied"', () => {
    const { container } = mountWith({ body: 'hi', copied: true });
    const copy = container.querySelector('button[aria-label="Copy translation"]');
    expect(copy?.getAttribute('data-tooltip')).toBe('Copied');
  });

  // A disabled button is blurred to <body>, and Escape is bound to the panel root.
  it('the copy button stays focusable after a copy', () => {
    const { container } = mountWith({ body: 'hi', copied: true });
    const copy = container.querySelector('button[aria-label="Copy translation"]');
    expect(copy?.hasAttribute('disabled')).toBe(false);
  });

  it('the partial-copy button on an error stays focusable too', () => {
    const { container } = mountWith({
      body: 'partial',
      copied: true,
      error: { code: 'NETWORK', message: 'dropped' },
    });
    const copy = container.querySelector('button[aria-label="Copy partial translation"]');
    expect(copy?.hasAttribute('disabled')).toBe(false);
  });

  it('empty-body fallback message appears when not loading and body is empty', () => {
    const { container } = mountWith({ body: '', loading: false });
    expect(container.textContent).toMatch(/No translation came back/);
    // Plain words only — no dev vocabulary on the in-page surface ("Backends" tab name is fine).
    expect(container.textContent).not.toMatch(/Backend returned|model id/);
  });

  it('click-outside dismisses when the setting is on', async () => {
    const { onclose } = mountWith({ body: 'hi' }, true);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onclose).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it('click-outside is ignored when the setting is off', async () => {
    const { onclose } = mountWith({ body: 'hi' }, false);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onclose).not.toHaveBeenCalled();
    outside.remove();
  });

  it('click inside the dialog does not dismiss', async () => {
    const { container, onclose } = mountWith({ body: 'hi' }, true);
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onclose).not.toHaveBeenCalled();
  });

  it('swap button renders only when onswap prop is present', () => {
    const a = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hi' }),
        clickOutsideDismiss: true,
        showSource: false,
        ...handlers(),
      },
    });
    expect(a.container.querySelector('button[aria-label="Swap direction"]')).toBeNull();
    a.unmount();
    const h = handlers();
    const b = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hi' }),
        clickOutsideDismiss: true,
        showSource: false,
        onswap: vi.fn(),
        ...h,
      },
    });
    expect(b.container.querySelector('button[aria-label="Swap direction"]')).toBeTruthy();
  });

  it('swap button fires onswap', async () => {
    const onswap = vi.fn();
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hi' }),
        clickOutsideDismiss: true,
        showSource: false,
        onswap,
        ...handlers(),
      },
    });
    const swap = container.querySelector(
      'button[aria-label="Swap direction"]',
    ) as HTMLButtonElement;
    await fireEvent.click(swap);
    expect(onswap).toHaveBeenCalledTimes(1);
  });

  it('swap button is disabled when direction.source is "auto"', () => {
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hi' }),
        clickOutsideDismiss: true,
        showSource: false,
        onswap: vi.fn(),
        direction: { source: 'auto', target: 'en' },
        ...handlers(),
      },
    });
    const swap = container.querySelector(
      'button[aria-label="Swap direction"]',
    ) as HTMLButtonElement;
    expect(swap).toBeTruthy();
    expect(swap.hasAttribute('disabled')).toBe(true);
    expect(swap.getAttribute('data-tooltip')).toMatch(/pick a source language first/i);
  });

  it('swap button renders in the error-with-body row too', () => {
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({
          body: 'partial translation',
          error: { code: 'NETWORK', message: 'offline' },
        }),
        clickOutsideDismiss: true,
        showSource: false,
        onswap: vi.fn(),
        ...handlers(),
      },
    });
    expect(container.querySelector('button[aria-label="Swap direction"]')).toBeTruthy();
  });

  it('swap button renders in the error-only row too', () => {
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: '', error: { code: 'NETWORK', message: 'offline' } }),
        clickOutsideDismiss: true,
        showSource: false,
        onswap: vi.fn(),
        ...handlers(),
      },
    });
    expect(container.querySelector('button[aria-label="Swap direction"]')).toBeTruthy();
  });

  // testHooks `hasError` probes `[data-ega-retry]`, so both error rows need it.
  it.each([
    ['error with partial body', 'partial translation'],
    ['error with no body', ''],
  ])('marks the retry button with data-ega-retry (%s)', (_label, body) => {
    const { container } = mountWith({ body, error: { code: 'NETWORK', message: 'offline' } });
    const retry = container.querySelector('[data-ega-retry]');
    expect(retry).toBeTruthy();
    expect(retry?.getAttribute('aria-label')).toBe('Retry');
  });

  it('task select renders inside a .task-row flex wrapper so labels can wrap rather than truncate', () => {
    const ontaskchange = vi.fn();
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: '' }),
        clickOutsideDismiss: true,
        showSource: false,
        ontaskchange,
        ...handlers(),
      },
    });
    const taskSel = container.querySelector('.task-select');
    expect(taskSel).toBeTruthy();
    const row = container.querySelector('.task-row');
    expect(row).toBeTruthy();
    expect(row?.contains(taskSel as Node)).toBe(true);
  });

  it('shadow.css gives .task-select min-width >= 110px so "Translate" label fits', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const cssPath = path.resolve(process.cwd(), 'src/content/shadow.css');
    const css = await fs.readFile(cssPath, 'utf8');
    const match = css.match(/\.tooltip \.task-select\s*\{[^}]*min-width:\s*(\d+)px/);
    expect(match).not.toBeNull();
    if (!match) throw new Error('no .task-select min-width rule');
    const minW = Number.parseInt(match[1] ?? '0', 10);
    expect(minW).toBeGreaterThanOrEqual(110);
  });

  it('click on an action button inside a closed shadow root does not dismiss the tooltip', async () => {
    // In a closed shadow root, composedPath() at document level stops at the host and never lists rootEl.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);
    const h = handlers();
    const { unmount } = render(Tooltip, {
      target: mountPoint,
      props: { tip: baseTip({ body: 'hi' }), clickOutsideDismiss: true, ...h },
    });
    try {
      const innerButton = shadow.querySelector('button[aria-label="Copy translation"]');
      expect(innerButton).toBeTruthy();
      if (!innerButton) throw new Error('no inner button');
      innerButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
      expect(h.onclose).not.toHaveBeenCalled();
    } finally {
      unmount();
      host.remove();
    }
  });

  it('tooltip container has a max-width clamp', () => {
    const css = readFileSync('src/content/shadow.css', 'utf8');
    expect(css).toMatch(/\.tooltip\b[\s\S]+?max-width:\s*\d+px/);
  });

  describe('draggable mode', () => {
    it('does NOT add the is-draggable class when draggable=false (default)', () => {
      const { container } = render(Tooltip, {
        props: {
          tip: baseTip({ body: 'hi' }),
          clickOutsideDismiss: true,
          showSource: false,
          draggable: false,
          ...handlers(),
        },
      });
      const root = container.querySelector('.tooltip');
      expect(root?.classList.contains('is-draggable')).toBe(false);
    });
    it('adds the is-draggable class when draggable=true', () => {
      const { container } = render(Tooltip, {
        props: {
          tip: baseTip({ body: 'hi' }),
          clickOutsideDismiss: true,
          showSource: false,
          draggable: true,
          ...handlers(),
        },
      });
      const root = container.querySelector('.tooltip');
      expect(root?.classList.contains('is-draggable')).toBe(true);
    });
    it('left/top reflect tip anchor when no drag has happened', () => {
      const { container } = render(Tooltip, {
        props: {
          tip: baseTip({ body: 'hi', left: 100, top: 200 }),
          clickOutsideDismiss: true,
          showSource: false,
          draggable: true,
          ...handlers(),
        },
      });
      const root = container.querySelector<HTMLElement>('.tooltip');
      expect(root?.style.left).toBe('100px');
      expect(root?.style.top).toBe('200px');
    });
  });

  describe('dismiss mode: close button tied to clickOutsideDismiss', () => {
    it('HIDES the close button when clickOutsideDismiss=true (no redundant dismiss)', () => {
      const { container } = mountWith({ body: 'Welcome' }, /* clickOutsideDismiss */ true);
      const closeBtns = container.querySelectorAll('button[aria-label="Close"]');
      expect(closeBtns.length).toBe(0);
    });
    it('SHOWS the close button when clickOutsideDismiss=false', () => {
      const { container } = mountWith({ body: 'Welcome' }, /* clickOutsideDismiss */ false);
      const closeBtns = container.querySelectorAll('button[aria-label="Close"]');
      expect(closeBtns.length).toBeGreaterThan(0);
    });
    it('HIDES the close button in the error-with-body state too (consistency)', () => {
      const { container } = mountWith(
        { body: 'partial', error: { code: 'NETWORK', message: 'oops' } },
        /* clickOutsideDismiss */ true,
      );
      const closeBtns = container.querySelectorAll('button[aria-label="Close"]');
      expect(closeBtns.length).toBe(0);
    });
    it('HIDES the close button in the error-no-body state too (consistency)', () => {
      const { container } = mountWith(
        { error: { code: 'NETWORK', message: 'oops' } },
        /* clickOutsideDismiss */ true,
      );
      const closeBtns = container.querySelectorAll('button[aria-label="Close"]');
      expect(closeBtns.length).toBe(0);
    });
  });

  describe('loading-state shimmer label reflects the active task', () => {
    const cases: Array<[Task, string]> = [
      ['translate', 'Translating…'],
      ['explain', 'Explaining…'],
      ['summarize', 'Summarizing…'],
      ['reword', 'Rewording…'],
      ['grammar', 'Fixing grammar…'],
    ];
    for (const [task, expected] of cases) {
      it(`shows "${expected}" when task=${task} is loading`, () => {
        const { container } = mountWith({ loading: true, body: '', task });
        const label = container.querySelector('.shimmer-label');
        expect(label?.textContent).toBe(expected);
      });
    }
    it('falls back to Translating… when task is undefined', () => {
      const { container } = mountWith({ loading: true, body: '' });
      const label = container.querySelector('.shimmer-label');
      expect(label?.textContent).toBe('Translating…');
    });
  });

  describe('inspector drawer', () => {
    it('hides the ⓘ icon when meta is absent', () => {
      const { queryByLabelText } = mountWith({ body: 'hello' });
      expect(queryByLabelText('Show inspector')).toBeNull();
    });

    it('shows the ⓘ icon when meta is present', () => {
      const meta: ResultMeta = {
        backendId: asBackendIdUnsafe('anthropic'),
        cacheHit: false,
        latencyMs: 250,
      };
      const { getByLabelText } = mountWith({ body: 'hello', meta });
      expect(getByLabelText('Show inspector')).toBeTruthy();
    });

    it('clicking the ⓘ icon opens the drawer with meta rows', async () => {
      const meta: ResultMeta = {
        backendId: asBackendIdUnsafe('anthropic'),
        cacheHit: false,
        latencyMs: 250,
      };
      const { getByLabelText, getByText } = mountWith({ body: 'hello', meta });
      await fireEvent.click(getByLabelText('Show inspector'));
      expect(getByLabelText('Close details')).toBeTruthy();
      expect(getByText('Anthropic')).toBeTruthy();
      expect(getByText('250 ms')).toBeTruthy();
    });
  });

  it('topbar wraps task picker + close in one row when ontaskchange present', () => {
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hola' }),
        clickOutsideDismiss: false,
        ontaskchange: vi.fn(),
        onclose: vi.fn(),
        oncancel: vi.fn(),
        onretry: vi.fn(),
        oncopy: vi.fn(),
        onexplain: vi.fn(),
        onopenoptions: vi.fn(),
      },
    });
    expect(container.querySelector('.tooltip-topbar')).toBeTruthy();
    expect(container.querySelector('.tooltip-topbar .tooltip-close')).toBeTruthy();
  });

  it('topbar renders when clickOutsideDismiss=false even without ontaskchange', () => {
    const { container } = mountWith({ body: 'hi' }, /* clickOutsideDismiss */ false);
    expect(container.querySelector('.tooltip-topbar')).toBeTruthy();
    expect(container.querySelector('.tooltip-topbar .tooltip-close')).toBeTruthy();
  });

  it('topbar absent when clickOutsideDismiss=true and no ontaskchange', () => {
    const { container } = mountWith({ body: 'hi' }, /* clickOutsideDismiss */ true);
    expect(container.querySelector('.tooltip-topbar')).toBeNull();
  });

  it('hides Explain action when tip.imageUrl is present', () => {
    const { queryByLabelText } = mountWith({
      body: 'translation',
      loading: false,
      imageUrl: 'https://example.test/sign.png',
    });
    expect(queryByLabelText(/explain/i)).toBeNull();
  });

  it('shows Explain action when tip.imageUrl is absent', () => {
    const { container } = mountWith({ body: 'translation', loading: false });
    expect(container.querySelector('button[aria-label="Explain this translation"]')).toBeTruthy();
  });

  describe('confidence pill — zero edge', () => {
    it('does NOT render the pill when confidence=0 even with threshold=0', () => {
      const { container } = mountWith({ body: 'hi', confidence: 0, confidencePill: true });
      expect(container.querySelector('.pill')).toBeNull();
    });

    it('renders the pill when confidence>0 with default threshold=0', () => {
      const { container } = mountWith({ body: 'hi', confidence: 0.75, confidencePill: true });
      const pill = container.querySelector('.pill');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toContain('75%');
    });

    it('hides the pill when confidencePill=false regardless of confidence', () => {
      const { container } = mountWith({ body: 'hi', confidence: 0.9, confidencePill: false });
      expect(container.querySelector('.pill')).toBeNull();
    });
  });

  it('icon hover label is positioned below the icon button (not above)', () => {
    const css = readFileSync('src/content/shadow.css', 'utf8');
    // jsdom cannot compute ::after geometry, so read the rule: `anchor(bottom)` or the `top: calc(100% + …)` fallback both sit below.
    expect(css).toMatch(
      /\.icon-btn\[data-tooltip\][^{]*?:hover::after[\s\S]*?top:\s*calc\((?:100% \+|anchor\()/,
    );
    // `bottom: calc(100% + …)` would push the label up over the translation body.
    const bubbleCssSection = css.match(
      /\.icon-btn\[data-tooltip\][^{]*?:hover::after[\s\S]*?z-index[^;]+;/,
    );
    expect(bubbleCssSection).not.toBeNull();
    expect(bubbleCssSection?.[0]).not.toMatch(/bottom:\s*calc\(100% \+/);
    expect(bubbleCssSection?.[0]).toMatch(/position:\s*absolute/);
    expect(css).not.toMatch(/anchor-name:\s*--ega-iconbtn/);
  });
});

describe('Continue in side panel — only when there is text to carry', () => {
  function mountEscalatable(tipOverrides: Partial<TipState>) {
    const onescalate = vi.fn();
    const utils = render(Tooltip, {
      props: {
        tip: baseTip(tipOverrides),
        clickOutsideDismiss: true,
        showSource: false,
        ...handlers(),
        onescalate,
      },
    });
    return { ...utils, onescalate };
  }

  it('hides Continue on a failed image translate (no source text to hand off)', () => {
    const { container } = mountEscalatable({
      srcText: '',
      body: '',
      loading: false,
      imageUrl: 'https://example.test/sign.png',
      error: { code: 'NETWORK', message: 'offline' },
    });
    expect(container.querySelector('button[data-ega-escalate="continue"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Retry"]')).toBeTruthy();
  });

  it('hides Continue when the source text is whitespace only', () => {
    const { container } = mountEscalatable({
      srcText: '   ',
      error: { code: 'NETWORK', message: 'offline' },
    });
    expect(container.querySelector('button[data-ega-escalate="continue"]')).toBeNull();
  });

  it('shows Continue on a failed text translate', () => {
    const { container } = mountEscalatable({
      srcText: 'Hola',
      error: { code: 'NETWORK', message: 'offline' },
    });
    expect(container.querySelector('button[data-ega-escalate="continue"]')).toBeTruthy();
  });

  it('Continue is a labeled text button, not icon-only', () => {
    const { container } = mountEscalatable({
      srcText: 'Hola',
      error: { code: 'SERVER', message: 'HTTP 500' },
    });
    const btn = container.querySelector('button[data-ega-escalate="continue"]');
    expect(btn?.textContent.trim()).toBe('Continue in side panel');
  });
});

describe('Pin to side panel — every text success can pin', () => {
  function mountEscalatable(tipOverrides: Partial<TipState>) {
    const onescalate = vi.fn();
    const utils = render(Tooltip, {
      props: {
        tip: baseTip(tipOverrides),
        clickOutsideDismiss: true,
        showSource: false,
        ...handlers(),
        onescalate,
      },
    });
    return { ...utils, onescalate };
  }

  it('shows Pin on a success WITHOUT a subtext payload', () => {
    const { container } = mountEscalatable({ body: 'Hola', loading: false });
    expect(container.querySelector('button[data-ega-escalate="pin"]')).toBeTruthy();
  });

  it('shows Pin on a success WITH a subtext payload (same action row either way)', () => {
    const { container } = mountEscalatable({
      body: 'Hola',
      loading: false,
      explain: 'a greeting',
    });
    expect(container.querySelector('button[data-ega-escalate="pin"]')).toBeTruthy();
  });

  it('image success shows open-image instead of Pin', () => {
    const { container } = mountEscalatable({
      body: 'Sign text',
      loading: false,
      imageUrl: 'https://example.test/sign.png',
    });
    expect(container.querySelector('button[data-ega-escalate="pin"]')).toBeNull();
    expect(container.querySelector('button[data-ega-escalate="open-image"]')).toBeTruthy();
  });

  it('hides Pin in error mode', () => {
    const { container } = mountEscalatable({
      srcText: 'Hola',
      error: { code: 'NETWORK', message: 'offline' },
    });
    expect(container.querySelector('button[data-ega-escalate="pin"]')).toBeNull();
  });
});

describe('direction pill (meta row)', () => {
  function mountWithDirection(
    tipOverrides: Partial<TipState>,
    direction?: { source: string; target: string },
  ) {
    return render(Tooltip, {
      props: {
        tip: baseTip(tipOverrides),
        clickOutsideDismiss: true,
        showSource: false,
        ...(direction ? { direction } : {}),
        ...handlers(),
      },
    });
  }

  it('renders the active pair when the source is concrete', () => {
    const { container } = mountWithDirection({ body: 'Hola' }, { source: 'en', target: 'es' });
    const pill = container.querySelector('[data-ega-direction]');
    expect(pill?.textContent).toBe('en→es');
  });

  it('hides the pill when the source is auto', () => {
    const { container } = mountWithDirection({ body: 'Hola' }, { source: 'auto', target: 'es' });
    expect(container.querySelector('[data-ega-direction]')).toBeNull();
  });

  it('hides the pill when no direction is wired', () => {
    const { container } = mountWithDirection({ body: 'Hola' });
    expect(container.querySelector('[data-ega-direction]')).toBeNull();
  });

  it('renders in error mode too, so a failed swap still shows what ran', () => {
    const { container } = mountWithDirection(
      { error: { code: 'SERVER', message: 'HTTP 500' } },
      { source: 'es', target: 'en' },
    );
    expect(container.querySelector('[data-ega-direction]')?.textContent).toBe('es→en');
  });

  it('names a built-in variety instead of its id', () => {
    const { container } = mountWithDirection({ body: 'Hi' }, { source: 'arabizi', target: 'en' });
    expect(container.querySelector('[data-ega-direction]')?.textContent).toBe('Arabizi→en');
  });

  it('names a custom variety instead of its 36-char id', async () => {
    resetCustomLanguagesCache();
    const customId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    await upsertCustomLanguage({
      id: preset(customId),
      label: 'Lebanese Arabizi',
      hint: 'h',
      examples: [],
      createdAt: 1,
    });
    // Drive the real cache the tooltip reads, not a hand-seeded map.
    await ensureCustomLanguages();
    const { container } = mountWithDirection({ body: 'Hi' }, { source: customId, target: 'en' });
    expect(container.querySelector('[data-ega-direction]')?.textContent).toBe(
      'Lebanese Arabizi→en',
    );
    resetCustomLanguagesCache();
  });
});
