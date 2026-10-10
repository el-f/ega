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
import { setSettings } from '@/content/settings-cache';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

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
  contextTask?: Task;
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
    settled: true,
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
    onregenerate: vi.fn(),
    onrefine: vi.fn(),
    ontargetchange: vi.fn(),
    ontaskchange: vi.fn(),
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

async function menu(container: HTMLElement, name: string): Promise<HTMLElement> {
  const trigger = container.querySelector<HTMLElement>('button[aria-label="' + name + '"]');
  if (!trigger) throw new Error('no ' + name + ' trigger');
  await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  return vi.waitFor(() => {
    const opened = container.querySelector<HTMLElement>('[role="menu"]');
    if (!opened) throw new Error('no menu');
    return opened;
  });
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
    expect(getByText('Stop')).toBeTruthy();
  });

  it('keeps Cancel while the body streams, and drops it once the turn settles', () => {
    const hasCancel = (el: HTMLElement): boolean =>
      Array.from(el.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Stop');

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

  // Same gate as the side panel: an error Settings can fix keeps Retry, so the user fixes it, then retries.
  it('AUTH error keeps Retry beside the Open settings CTA', () => {
    const { container } = mountWith({ error: { code: 'AUTH', message: 'bad key' } });
    expect(container.querySelector('button[data-ega-retry]')).toBeTruthy();
    const cta = container.querySelector('[data-ega-tooltip-error-cta]');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Open settings');
  });

  it('QUOTA error keeps Retry too (mirrors the sidepanel gate)', () => {
    const { container } = mountWith({ error: { code: 'QUOTA', message: 'over limit' } });
    expect(container.querySelector('button[data-ega-retry]')).toBeTruthy();
  });

  // Terminal, and no Settings tab fixes them: the same request fails the same way.
  it.each(['REQUEST', 'UNKNOWN', 'IMAGE_UNSUPPORTED'] as const)(
    '%s error with no Settings tab hides Retry',
    (code) => {
      const { container } = mountWith({ error: { code, message: 'it failed' } });
      expect(container.querySelector('button[data-ega-retry]')).toBeNull();
    },
  );

  it.each(['NETWORK', 'SERVER', 'RATE_LIMIT', 'TIMEOUT'] as const)(
    'retryable %s error keeps Retry',
    (code) => {
      const { container } = mountWith({ error: { code, message: 'transient' } });
      expect(container.querySelector('button[data-ega-retry]')).toBeTruthy();
    },
  );

  it('ABORTED (user cancel) keeps Retry — re-running is the natural recovery', () => {
    const { container } = mountWith({ error: { code: 'ABORTED', message: 'canceled' } });
    expect(container.querySelector('button[data-ega-retry]')).toBeTruthy();
  });

  it('does not show the Open settings CTA on NETWORK error', () => {
    const { container } = mountWith({
      error: { code: 'NETWORK', message: 'offline' },
    });
    expect(container.querySelector('button[data-ega-retry]')).toBeTruthy();
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
    const retry = container.querySelector<HTMLButtonElement>('button[data-ega-retry]');
    expect(retry).toBeTruthy();
    expect(retry?.hasAttribute('disabled')).toBe(true);
  });

  it('renders explain as a labeled block (not muted .src text)', () => {
    const { container } = mountWith({
      body: 'translation',
      explain: 'cultural context here',
    });
    const block = container.querySelector('[data-ega-note]');
    expect(block).toBeTruthy();
    expect(block?.textContent).toContain('Context & subtext');
    expect(block?.textContent).toContain('cultural context here');
  });

  it('omits the explain block when explain is absent', () => {
    const { container } = mountWith({ body: 'translation' });
    expect(container.querySelector('[data-ega-note]')).toBeNull();
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
    const meta = container.querySelector('[data-ega-reply-meta]');
    expect(meta?.textContent).toContain('Arabizi');
    expect(meta?.textContent).not.toContain('arabizi');
  });

  it('unknown detectedLang (e.g. custom uuid or "other") passes through verbatim', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'custom-xyz',
    });
    const meta = container.querySelector('[data-ega-reply-meta]');
    expect(meta?.textContent).toContain('custom-xyz');
  });

  it('detectedDetail renders as "Label — detail" next to the preset name', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine',
    });
    const meta = container.querySelector('[data-ega-reply-meta]');
    // Em dash, not parens: detectedDetail can already carry parens.
    expect(meta?.textContent).toContain('Arabizi (Levantine)');
  });

  it('detectedDetail with inner parens stays readable (no double-paren bug)', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine (Lebanese)',
    });
    const meta = container.querySelector('[data-ega-reply-meta]');
    expect(meta?.textContent).not.toMatch(/\(\(/);
    expect(meta?.textContent).not.toMatch(/\)\)/);
    expect(meta?.textContent).toContain('Levantine (Lebanese)');
  });

  it('detectedDetail without detectedLang still shows (rare but possible)', () => {
    const { container } = mountWith({
      body: 'hi',
      detectedDetail: 'looks like Venetian Italian',
    });
    const meta = container.querySelector('[data-ega-reply-meta]');
    expect(meta?.textContent).toContain('Venetian Italian');
  });

  it('combines mixed languages in one shared direction item', async () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLangs: [{ id: 'arabizi' }, { id: 'elvish-quenya', detail: 'high-elven' }],
    });
    const line = container.querySelector('[data-ega-meta-item="direction"]');
    expect(line?.textContent).toContain('Arabizi + Elvish');
    expect(line?.textContent).toContain('high-elven');
    expect(container.querySelector('.lang-pill')).toBeNull();
  });

  it('shows one detected language without a pill cluster', async () => {
    const { container } = mountWith({
      body: 'hi',
      detectedLang: 'arabizi',
      detectedLangs: [{ id: 'arabizi' }],
    });
    expect(container.querySelector('[data-ega-meta-item="direction"]')?.textContent).toBe(
      'Arabizi',
    );
    expect(container.querySelector('.lang-cluster')).toBeNull();
  });

  it('action buttons have accessible names and no native title', async () => {
    const { container } = mountWith({ body: 'hi' });
    for (const name of ['Copy translation', 'Regenerate', 'Refine', 'More', 'Close']) {
      const button = container.querySelector('button[aria-label="' + name + '"]');
      expect(button).not.toBeNull();
      expect(button?.getAttribute('title')).toBeNull();
    }
  });

  it('the action icons expose a hover label', async () => {
    const { container } = mountWith({ body: 'hi' });
    for (const [name, label] of [
      ['Copy translation', 'Copy'],
      ['Regenerate', 'Regenerate'],
      ['Refine', 'Refine'],
      ['More', 'More'],
    ]) {
      expect(
        container.querySelector('button[aria-label="' + name + '"]')?.getAttribute('data-tooltip'),
      ).toBe(label);
    }
  });

  // The "?" glyph alone reads as Help, so Explain carries its word and needs no hover label.
  it('More offers the named Explain alternative', async () => {
    const { container } = mountWith({ body: 'hi' });
    const opened = await menu(container, 'More');
    expect(opened.textContent).toContain('Explain instead');
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

  it('Refine offers Swap only when the surface can rerun it', async () => {
    const a = render(Tooltip, {
      props: { tip: baseTip({ body: 'hi' }), clickOutsideDismiss: true, ...handlers() },
    });
    expect((await menu(a.container, 'Refine')).textContent).not.toMatch(/Swap/);
    a.unmount();
    const b = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hi' }),
        clickOutsideDismiss: true,
        ...handlers(),
        onswap: vi.fn(),
      },
    });
    expect((await menu(b.container, 'Refine')).textContent).toContain('Swap');
  });

  it('the Refine Swap item reruns the original source', async () => {
    const onswap = vi.fn();
    const { container } = render(Tooltip, {
      props: { tip: baseTip({ body: 'hi' }), clickOutsideDismiss: true, ...handlers(), onswap },
    });
    const opened = await menu(container, 'Refine');
    const swap = [...opened.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent.trim() === 'Swap',
    );
    expect(swap).toBeTruthy();
    if (!swap) throw new Error('No Swap item');
    await fireEvent.click(swap);
    expect(onswap).toHaveBeenCalledTimes(1);
  });

  // aria-disabled, not disabled: a disabled button cannot take focus, so the reason would be hover-only.
  it('an unresolved source keeps Swap readable with its reason', async () => {
    const onswap = vi.fn();
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hi' }),
        clickOutsideDismiss: true,
        ...handlers(),
        onswap,
        direction: { source: 'auto', target: 'en' },
      },
    });
    const opened = await menu(container, 'Refine');
    const swap = [...opened.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
      el.textContent.includes('Swap'),
    );
    expect(swap?.getAttribute('aria-disabled')).toBe('true');
    expect(swap?.textContent).toContain('pick a source language first');
    swap?.focus();
    expect(document.activeElement).toBe(swap);
    if (!swap) throw new Error('No Swap item');
    await fireEvent.click(swap);
    expect(onswap).not.toHaveBeenCalled();
  });

  // Swapping re-sends the same text; it does not fix an error, so the error row offers Try again only.
  it('swap button is hidden in the error-with-body row', () => {
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
    expect(container.querySelector('button[aria-label="Swap direction"]')).toBeNull();
  });

  it('swap button is hidden in the error-only row', () => {
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: '', error: { code: 'NETWORK', message: 'offline' } }),
        clickOutsideDismiss: true,
        showSource: false,
        onswap: vi.fn(),
        ...handlers(),
      },
    });
    expect(container.querySelector('button[aria-label="Swap direction"]')).toBeNull();
  });

  // Swap re-sends the selection with the pair flipped, so the hover text names the new pair.
  it('the visible direction remains available while choosing Swap', async () => {
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: 'hi' }),
        clickOutsideDismiss: true,
        ...handlers(),
        onswap: vi.fn(),
        direction: { source: 'en', target: 'es' },
      },
    });
    expect(container.querySelector('[data-ega-direction]')?.textContent).toBe('English → Spanish');
    expect((await menu(container, 'Refine')).textContent).toContain('Swap');
  });

  // testHooks `hasError` probes `[data-ega-retry]`, so both error rows need it.
  it.each([
    ['error with partial body', 'partial translation'],
    ['error with no body', ''],
  ])('marks the retry button with data-ega-retry (%s)', (_label, body) => {
    const { container } = mountWith({ body, error: { code: 'NETWORK', message: 'offline' } });
    const retry = container.querySelector('[data-ega-retry]');
    expect(retry).toBeTruthy();
    expect(retry?.textContent.trim()).toBe('Retry');
  });

  it('task select renders inside a .task-row flex wrapper so labels can wrap rather than truncate', () => {
    const ontaskchange = vi.fn();
    const { container } = render(Tooltip, {
      props: {
        tip: baseTip({ body: '' }),
        clickOutsideDismiss: true,
        showSource: false,
        ...handlers(),
        ontaskchange,
      },
    });
    const taskSel = container.querySelector('.task-select');
    expect(taskSel).toBeTruthy();
    const row = container.querySelector('.task-row');
    expect(row).toBeTruthy();
    expect(row?.contains(taskSel as Node)).toBe(true);
  });

  it('tooltip.css gives .task-select min-width >= 110px so "Translate" label fits', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const cssPath = path.resolve(process.cwd(), 'src/content/tooltip/tooltip.css');
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
    const css = readFileSync('src/content/tooltip/tooltip.css', 'utf8');
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
    it('keeps the close button when clickOutsideDismiss=true (explicit keyboard and pointer control)', async () => {
      const { container } = mountWith(
        { body: 'hi', error: { code: 'NETWORK', message: 'offline' } },
        true,
      );
      expect(container.querySelector('button[aria-label="Close"]')).not.toBeNull();
    });
    it('SHOWS the close button when clickOutsideDismiss=false', () => {
      const { container } = mountWith({ body: 'Welcome' }, /* clickOutsideDismiss */ false);
      const closeBtns = container.querySelectorAll('button[aria-label="Close"]');
      expect(closeBtns.length).toBeGreaterThan(0);
    });
    it('keeps the close button in the error-with-body state too (consistency)', async () => {
      const { container } = mountWith(
        { body: 'hi', error: { code: 'NETWORK', message: 'offline' } },
        true,
      );
      expect(container.querySelector('button[aria-label="Close"]')).not.toBeNull();
    });
    it('keeps the close button in the error-no-body state too (consistency)', async () => {
      const { container } = mountWith(
        { body: 'hi', error: { code: 'NETWORK', message: 'offline' } },
        true,
      );
      expect(container.querySelector('button[aria-label="Close"]')).not.toBeNull();
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
      expect(queryByLabelText('Show details about this reply')).toBeNull();
    });

    it('More makes About available when result details were recorded', async () => {
      const { container } = mountWith({
        body: 'hello',
        meta: { backendId: asBackendIdUnsafe('anthropic'), cacheHit: false, latencyMs: 250 },
      });
      expect(
        (await menu(container, 'More')).querySelector('[role="menuitemcheckbox"]')?.textContent,
      ).toBe('About this reply');
    });

    it('About shows the recorded backend and elapsed time', async () => {
      const { container } = mountWith({
        body: 'hello',
        meta: { backendId: asBackendIdUnsafe('anthropic'), cacheHit: false, latencyMs: 250 },
      });
      const opened = await menu(container, 'More');
      const about = opened.querySelector('[role="menuitemcheckbox"]');
      if (!about) throw new Error('No About item');
      await fireEvent.click(about);
      expect(container.querySelector('.reply-details')?.textContent).toContain('Anthropic');
      expect(container.querySelector('.reply-details')?.textContent).toContain('0.3 s');
      expect(container.querySelectorAll('button[aria-label="Close"]')).toHaveLength(1);
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

  it('the header retains Close when click-outside dismissal is on', async () => {
    const { container } = mountWith({ body: 'hi' }, true);
    expect(container.querySelector('.tooltip-topbar .tooltip-close')).not.toBeNull();
  });

  it('hides Explain action when tip.imageUrl is present', () => {
    const { queryByLabelText } = mountWith({
      body: 'translation',
      loading: false,
      imageUrl: 'https://example.test/sign.png',
    });
    expect(queryByLabelText(/explain/i)).toBeNull();
  });

  it('the text reply More menu offers Explain instead', async () => {
    const { container } = mountWith({ body: 'hi' });
    expect((await menu(container, 'More')).textContent).toContain('Explain instead');
  });

  describe('confidence pill — zero edge', () => {
    it('does NOT render the pill when confidence=0 even with threshold=0', () => {
      const { container } = mountWith({ body: 'hi', confidence: 0, confidencePill: true });
      expect(container.querySelector('[data-ega-meta-item="confidence"]')).toBeNull();
    });

    it('renders the pill when confidence>0 with default threshold=0', () => {
      const { container } = mountWith({ body: 'hi', confidence: 0.75, confidencePill: true });
      const pill = container.querySelector('[data-ega-meta-item="confidence"]');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toContain('75%');
    });

    it('hides the pill when confidencePill=false regardless of confidence', () => {
      const { container } = mountWith({ body: 'hi', confidence: 0.9, confidencePill: false });
      expect(container.querySelector('[data-ega-meta-item="confidence"]')).toBeNull();
    });
  });

  it('icon hover label is positioned below the icon button (not above)', () => {
    const css = readFileSync('src/content/tooltip/tooltip.css', 'utf8');
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
    expect(container.querySelector('button[data-ega-retry]')).toBeTruthy();
  });

  it('a failed image routes Open in side panel through the open-panel handoff', async () => {
    const { getByRole, onescalate } = mountEscalatable({
      srcText: '',
      imageUrl: 'https://example.test/sign.png',
      error: { code: 'IMAGE_UNSUPPORTED', message: 'Save it and attach the file.' },
    });
    await fireEvent.click(getByRole('button', { name: 'Open in side panel' }));
    expect(onescalate).toHaveBeenCalledWith('open-panel');
  });

  it('names an image tooltip in its header, so the close row is not an empty bar', () => {
    const { container } = mountEscalatable({
      srcText: '',
      loading: true,
      imageUrl: 'https://example.test/sign.png',
    });
    expect(container.querySelector('.tooltip-topbar')?.textContent).toContain('Image translation');
  });

  // Only the pending tooltip passes task; a result or error carries the task it ran as contextTask.
  it.each([
    ['result', { body: 'A stop sign.' }],
    ['error', { error: { code: 'NETWORK' as const, message: 'offline' } }],
  ])('heads an image Explain %s "Image explanation"', (_name, state) => {
    const { container } = mountEscalatable({
      srcText: '',
      imageUrl: 'https://example.test/sign.png',
      contextTask: 'explain',
      ...state,
    });
    expect(container.querySelector('.tooltip-topbar')?.textContent).toContain('Image explanation');
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

  it('the error handoff has the same accessible name as the success handoff', async () => {
    const { container } = mountEscalatable({
      srcText: 'Hola',
      error: { code: 'SERVER', message: 'HTTP 500' },
    });
    expect(
      container.querySelector('button[data-ega-escalate="continue"]')?.getAttribute('aria-label'),
    ).toBe('Open in side panel');
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
    expect(pill?.textContent).toBe('English → Spanish');
  });

  // One action row: the pills end it instead of taking a second row under it.
  it.each([
    ['success', { body: 'Hola' }],
    ['loading', { loading: true, body: '' }],
    ['error', { error: { code: 'SERVER' as const, message: 'HTTP 500' } }],
  ])('sits inside the action row in %s mode', (_mode, state) => {
    const { container } = mountWithDirection(state, { source: 'en', target: 'es' });
    expect(container.querySelector('[data-ega-reply-meta] [data-ega-direction]')).not.toBeNull();
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
    expect(container.querySelector('[data-ega-direction]')?.textContent).toBe('Spanish → English');
  });

  it('names a built-in variety instead of its id', () => {
    const { container } = mountWithDirection({ body: 'Hi' }, { source: 'arabizi', target: 'en' });
    expect(container.querySelector('[data-ega-direction]')?.textContent).toBe('Arabizi → English');
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
      'Lebanese Arabizi → English',
    );
    resetCustomLanguagesCache();
  });
});

describe('Tooltip tone select', () => {
  const withTaskPicker = (task: Task) =>
    render(Tooltip, {
      props: {
        tip: baseTip({ task }),
        clickOutsideDismiss: true,
        showSource: false,
        ...handlers(),
        ontaskchange: vi.fn(),
      },
    });

  it('shows for a task whose prompt has a {{tone}} slot', () => {
    setSettings({
      ...DEFAULT_SETTINGS,
      taskOverrides: { summarize: { system: 'Summarize in a {{tone}} way.' } },
    });
    expect(
      withTaskPicker('summarize').container.querySelector('[data-ega-tone-select]'),
    ).not.toBeNull();
  });

  it('shows for Translate when the source language prompt has {{tone}}', () => {
    setSettings({
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        perPresetTemplates: { arabizi: { system: 'Translate in a {{tone}} way.' } },
      },
    });
    const tip = (source: string) =>
      render(Tooltip, {
        props: {
          tip: baseTip({ task: 'translate' }),
          clickOutsideDismiss: true,
          showSource: false,
          direction: { source, target: 'en' },
          ...handlers(),
          ontaskchange: vi.fn(),
        },
      }).container.querySelector('[data-ega-tone-select]');
    expect(tip('arabizi')).not.toBeNull();
    expect(tip('fr')).toBeNull();
  });

  it('hides for a task whose prompt has none', () => {
    setSettings({ ...DEFAULT_SETTINGS });
    expect(
      withTaskPicker('summarize').container.querySelector('[data-ega-tone-select]'),
    ).toBeNull();
    expect(
      withTaskPicker('reword').container.querySelector('[data-ega-tone-select]'),
    ).not.toBeNull();
  });
});

describe('Tooltip Explain button follows the Explain task', () => {
  it('the More menu follows the Explain task setting', async () => {
    setSettings({ ...DEFAULT_SETTINGS, disabledTasks: [] });
    const on = mountWith({ body: 'hi' });
    expect((await menu(on.container, 'More')).textContent).toContain('Explain instead');
    on.unmount();
    setSettings({ ...DEFAULT_SETTINGS, disabledTasks: ['explain'] });
    const off = mountWith({ body: 'hi' });
    expect((await menu(off.container, 'More')).textContent).not.toContain('Explain instead');
    off.unmount();
    setSettings(DEFAULT_SETTINGS);
  });
});
