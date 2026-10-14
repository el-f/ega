// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleImageTranslateResult,
  handleImageTranslatePending,
  imageAnchorRect,
} from '@/content/index';
import { closeTooltip } from '@/content/tipState.svelte';
import { mountShadowHost, getContainer } from '@/content/shadowHost';
import { setSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { pending, rendererOwner } from '@/content/request-state';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Msg } from '@/shared/messages';
import type { ErrCode } from '@/shared/types';

// The background worker sends this message only when imageTranslateSurface is 'tooltip'.

const sendMessage = vi.fn().mockResolvedValue({ ok: true });
const openOptionsPage = vi.fn();
const storageSet = vi.fn().mockResolvedValue(undefined);

function makeMsg(
  overrides: Partial<{
    requestId: string;
    imageUrl: string;
    translation: string;
    confidence: number;
    error: { code: ErrCode; message: string; retryAfterMs?: number };
  }> = {},
): Extract<Msg, { kind: 'content:image-translate-result' }> {
  return {
    kind: 'content:image-translate-result',
    requestId: overrides.requestId ?? 'req-img-1',
    imageUrl: overrides.imageUrl ?? 'https://example.com/photo.jpg',
    translation: overrides.translation ?? 'Hello world',
    confidence: overrides.confidence ?? 0.95,
    ...(overrides.error !== undefined ? { error: overrides.error } : {}),
  };
}

function pendingMsgFor(
  msg: Extract<Msg, { kind: 'content:image-translate-result' }>,
): Extract<Msg, { kind: 'content:image-translate-pending' }> {
  return {
    kind: 'content:image-translate-pending',
    requestId: msg.requestId,
    imageUrl: msg.imageUrl,
  };
}

/** The worker always sends the pending frame first, so a result driven on its own tests a path production never takes. */
function runImageTranslate(msg: Extract<Msg, { kind: 'content:image-translate-result' }>): void {
  handleImageTranslatePending(pendingMsgFor(msg));
  handleImageTranslateResult(msg);
}

beforeEach(() => {
  document.body.innerHTML = '';
  pending.clear();
  rendererOwner.clear();
  document.documentElement.removeAttribute('data-ega-host-installed');

  // jsdom has no ResizeObserver — stub so openTooltip's queueMicrotask doesn't blow up.
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
      StubResizeObserver;
  }

  // openTooltip's mount path reads the chrome global.
  sendMessage.mockClear();
  openOptionsPage.mockClear();
  storageSet.mockClear();
  vi.stubGlobal('chrome', {
    runtime: { id: 'ega-test-id', sendMessage, openOptionsPage },
    storage: { local: { set: storageSet } },
  });

  // Viewport for positionFromRect
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });

  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  resetSettingsCacheForTest();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function activeWraps(): NodeListOf<HTMLElement> {
  return getContainer().querySelectorAll<HTMLElement>('[data-ega-tooltip-wrap]');
}

function sent(kind: string): Record<string, unknown>[] {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === kind);
}

/** Wait out the tooltip module's lazy load, then flush Svelte 5's microtask-batched DOM updates. */
async function tick(): Promise<void> {
  await vi.waitFor(() => {
    expect(activeWraps().length).toBeGreaterThan(0);
  });
  await Promise.resolve();
  await Promise.resolve();
}

describe('handleImageTranslateResult — success path', () => {
  it('Regenerate re-runs the same image arm without a text refinement', async () => {
    runImageTranslate(
      makeMsg({ requestId: 'regenerate-image', imageUrl: 'https://cdn.test/sign.png' }),
    );
    await tick();
    const regenerate = getContainer().querySelector<HTMLButtonElement>('[aria-label="Regenerate"]');
    expect(regenerate).not.toBeNull();
    regenerate?.click();
    expect(sent('image:translate')[0]).toMatchObject({
      imageUrl: 'https://cdn.test/sign.png',
      surface: 'tooltip',
    });
    expect(sent('image:translate')[0]?.['requestId']).not.toBe('regenerate-image');
  });

  it('mounts exactly one tooltip wrap', async () => {
    runImageTranslate(makeMsg());
    await tick();
    expect(activeWraps().length).toBe(1);
  });

  it('tooltip wrap carries the requestId', async () => {
    runImageTranslate(makeMsg({ requestId: 'req-42' }));
    await tick();
    expect(activeWraps()[0]?.getAttribute('data-ega-tooltip-wrap')).toBe('req-42');
  });

  it('renders the image thumbnail (.tooltip-image-source)', async () => {
    runImageTranslate(makeMsg({ imageUrl: 'https://cdn.test/img.png' }));
    await tick();
    const img = getContainer().querySelector<HTMLImageElement>('.tooltip-image-source');
    expect(img).not.toBeNull();
    expect(img?.src).toBe('https://cdn.test/img.png');
  });

  it('renders the translation body', async () => {
    runImageTranslate(makeMsg({ translation: 'Translated caption' }));
    await tick();
    const body = getContainer().querySelector('.body');
    expect(body?.textContent.trim()).toBe('Translated caption');
  });

  it('tooltip is not in loading state (shimmer absent)', async () => {
    runImageTranslate(makeMsg());
    await tick();
    const shimmer = getContainer().querySelector('.shimmer-wrap');
    expect(shimmer).toBeNull();
  });
});

describe('handleImageTranslateResult — error path', () => {
  it('mounts exactly one tooltip wrap', async () => {
    runImageTranslate(makeMsg({ error: { code: 'NETWORK', message: 'timeout' } }));
    await tick();
    expect(activeWraps().length).toBe(1);
  });

  it('renders the error message in .body', async () => {
    runImageTranslate(makeMsg({ error: { code: 'NETWORK', message: 'upstream timed out' } }));
    await tick();
    const body = getContainer().querySelector('.body');
    expect(body?.textContent).toContain('No connection');
    expect(body?.textContent).not.toContain('upstream timed out');
  });

  it('hides the image thumbnail on error: the error frame is text-only', async () => {
    runImageTranslate(
      makeMsg({
        imageUrl: 'https://cdn.test/err.jpg',
        error: { code: 'QUOTA', message: 'over limit' },
      }),
    );
    await tick();
    const img = getContainer().querySelector<HTMLImageElement>('.tooltip-image-source');
    expect(img).toBeNull();
    const errBody = getContainer().querySelector('.tooltip-error-body');
    expect(errBody).not.toBeNull();
    expect(errBody?.textContent).toContain('Out of credit');
    expect(errBody?.textContent).not.toContain('over limit');
  });
});

describe('image error tooltip — the recovery buttons do something', () => {
  it('Retry re-dispatches the vision call under a fresh request id', async () => {
    runImageTranslate(
      makeMsg({
        requestId: 'img-err',
        imageUrl: 'https://cdn.test/e.jpg',
        error: { code: 'NETWORK', message: 'timeout' },
      }),
    );
    await tick();
    const retry = getContainer().querySelector<HTMLButtonElement>('.tooltip [data-ega-retry]');
    expect(retry).not.toBeNull();

    retry?.click();
    await Promise.resolve();

    const dispatched = sent('image:translate');
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.['imageUrl']).toBe('https://cdn.test/e.jpg');
    expect(dispatched[0]?.['requestId']).not.toBe('img-err');
    // The retry lands in this tooltip again, not wherever the stored global points.
    expect(dispatched[0]?.['surface']).toBe('tooltip');
  });

  it('the settings CTA asks the worker to open the options page', async () => {
    runImageTranslate(makeMsg({ error: { code: 'AUTH', message: 'bad key' } }));
    await tick();
    const cta = getContainer().querySelector<HTMLButtonElement>('[data-ega-tooltip-error-cta]');
    expect(cta).not.toBeNull();

    cta?.click();
    await Promise.resolve();

    // A content script cannot call openOptionsPage itself.
    expect(sent('ui:open-options')).toHaveLength(1);
    expect(sent('ui:open-options')[0]?.['tab']).toBe('backends');
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it('a Retry-After on the error keeps Retry disabled with a countdown', async () => {
    runImageTranslate(
      makeMsg({ error: { code: 'RATE_LIMIT', message: 'slow down', retryAfterMs: 5000 } }),
    );
    await tick();
    const retry = getContainer().querySelector<HTMLButtonElement>('.tooltip [data-ega-retry]');
    expect(retry?.disabled).toBe(true);
    expect(retry?.textContent).toContain('Retry in 5s');
  });
});

describe('handleImageTranslateResult — confidence pill honors settings', () => {
  function pill(): HTMLElement | null {
    return getContainer().querySelector<HTMLElement>('.tooltip [data-ega-meta-item="confidence"]');
  }

  it('shows the pill by default for a high-confidence result', async () => {
    runImageTranslate(makeMsg({ confidence: 0.95 }));
    await tick();
    expect(pill()).not.toBeNull();
  });

  it('hides the pill when settings.confidencePill is off', async () => {
    setSettings({ ...DEFAULT_SETTINGS, confidencePill: false });
    runImageTranslate(makeMsg({ confidence: 0.95 }));
    await tick();
    expect(pill()).toBeNull();
  });

  it('hides the pill below settings.confidencePillThreshold', async () => {
    setSettings({ ...DEFAULT_SETTINGS, confidencePill: true, confidencePillThreshold: 0.99 });
    runImageTranslate(makeMsg({ confidence: 0.95 }));
    await tick();
    expect(pill()).toBeNull();
  });
});

describe('image Explain on the tooltip surface', () => {
  it('the loading tooltip names the explain task', async () => {
    handleImageTranslatePending({
      ...pendingMsgFor(makeMsg({ requestId: 'img-x' })),
      task: 'explain',
    });
    await tick();
    expect(getContainer().querySelector('.shimmer-label')?.textContent).toBe('Explaining…');
  });

  it('renders the explanation under the image text, marked as read from the image', async () => {
    runImageTranslate({
      ...makeMsg({ requestId: 'img-e', translation: 'hi' }),
      task: 'explain',
      explain: 'a greeting',
      usedImage: true,
    });
    await tick();
    expect(getContainer().querySelector('[data-ega-note="explain"]')?.textContent).toContain(
      'a greeting',
    );
    expect(getContainer().querySelector('.answer-note-image')).not.toBeNull();
  });
});

describe('handleImageTranslateResult — single-instance invariant', () => {
  it('a second call closes the first tooltip', async () => {
    runImageTranslate(makeMsg({ requestId: 'a' }));
    runImageTranslate(makeMsg({ requestId: 'b' }));
    await tick();
    expect(activeWraps().length).toBe(1);
    expect(activeWraps()[0]?.getAttribute('data-ega-tooltip-wrap')).toBe('b');
  });
});

describe('a vision request owns its tooltip like a text request', () => {
  it('registers the request so a newer tooltip can supersede it', () => {
    handleImageTranslatePending(pendingMsgFor(makeMsg({ requestId: 'img-owner' })));
    expect(rendererOwner.get('img-owner')).toBe('tooltip');
  });

  it('drops a late vision result once a newer tooltip took the surface', async () => {
    handleImageTranslatePending(pendingMsgFor(makeMsg({ requestId: 'img-late' })));
    await tick();
    // What a newer text translate does before it opens its own tooltip.
    rendererOwner.delete('img-late');
    rendererOwner.set('text-newer', 'tooltip');

    handleImageTranslateResult(makeMsg({ requestId: 'img-late', translation: 'stale caption' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(getContainer().textContent).not.toContain('stale caption');
    expect(getContainer().querySelector('.tooltip-image-wrap.is-loading')).not.toBeNull();
  });
});

describe('imageAnchorRect — result lands near the clicked image', () => {
  function addImage(src: string, r: Partial<DOMRect>): HTMLImageElement {
    const img = document.createElement('img');
    img.src = src;
    img.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 50,
        right: 300,
        bottom: 130,
        x: 100,
        y: 50,
        width: 200,
        height: 80,
        toJSON: () => ({}),
        ...r,
      }) as DOMRect;
    document.body.appendChild(img);
    return img;
  }

  it('returns the matching image rect when the image is in the DOM', () => {
    addImage('https://cdn.test/photo.jpg', {});
    const r = imageAnchorRect('https://cdn.test/photo.jpg');
    expect(r.left).toBe(100);
    expect(r.top).toBe(50);
    expect(r.width).toBe(200);
  });

  it('falls back to the viewport center when no image matches', () => {
    const r = imageAnchorRect('https://cdn.test/gone.jpg');
    expect(r.left).toBe(1280 / 2 - 50);
    expect(r.width).toBe(100);
  });

  it('skips a matching image with a zero-size rect (hidden/removed)', () => {
    addImage('https://cdn.test/hidden.jpg', { width: 0, height: 0 });
    const r = imageAnchorRect('https://cdn.test/hidden.jpg');
    expect(r.width).toBe(100);
  });
});

describe('handleImageTranslatePending — loading tooltip mounts immediately', () => {
  function pendingMsg(
    requestId: string,
  ): Extract<Msg, { kind: 'content:image-translate-pending' }> {
    return {
      kind: 'content:image-translate-pending',
      requestId,
      imageUrl: 'https://example.com/photo.jpg',
    };
  }

  it('mounts a tooltip in loading state with the image shimmer', async () => {
    handleImageTranslatePending(pendingMsg('pend-1'));
    await tick();
    expect(activeWraps().length).toBe(1);
    expect(getContainer().querySelector('.tooltip-image-wrap.is-loading')).not.toBeNull();
    expect(getContainer().querySelector('.tooltip-image-shimmer')).not.toBeNull();
  });

  it('offers Stop while the vision call runs', async () => {
    handleImageTranslatePending(pendingMsg('pend-2'));
    await tick();
    const buttons = Array.from(getContainer().querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent.trim() === 'Stop')).toBe(true);
  });

  it('the later result replaces the loading tooltip in place', async () => {
    handleImageTranslatePending(pendingMsg('pend-3'));
    await tick();
    handleImageTranslateResult(makeMsg({ requestId: 'pend-3', translation: 'Done text' }));
    await tick();
    expect(activeWraps().length).toBe(1);
    expect(getContainer().querySelector('.body')?.textContent.trim()).toBe('Done text');
  });

  it('Stop retains a retryable image tooltip and suppresses the late result', async () => {
    handleImageTranslatePending(pendingMsg('pend-4'));
    await tick();
    const cancelBtn = Array.from(getContainer().querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Stop',
    );
    expect(cancelBtn).toBeTruthy();
    cancelBtn?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(activeWraps().length).toBe(1);
    expect(getContainer().querySelector('[data-ega-retry]')).not.toBeNull();

    handleImageTranslateResult(makeMsg({ requestId: 'pend-4' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(activeWraps().length).toBe(1);
    expect(getContainer().querySelector('.body')?.textContent).toContain('No answer yet.');
  });
});

describe('image tooltips honour the click-outside setting', () => {
  async function clickOutside(): Promise<void> {
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    await Promise.resolve();
    await Promise.resolve();
  }

  it('stays open on an outside click when the setting is off', async () => {
    setSettings({ ...DEFAULT_SETTINGS, tooltipClickOutside: false });
    runImageTranslate(makeMsg());
    await tick();
    await clickOutside();
    expect(activeWraps().length).toBe(1);
  });

  it('closes on an outside click when the setting is on', async () => {
    setSettings({ ...DEFAULT_SETTINGS, tooltipClickOutside: true });
    runImageTranslate(makeMsg());
    await tick();
    await clickOutside();
    await vi.waitFor(() => expect(activeWraps().length).toBe(0));
  });
});
