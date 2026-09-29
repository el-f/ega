// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cancelPageTranslateV2,
  routePageV2Chunk,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import { rendererOwner } from '@/content/request-state';
import { dismissToast } from '@/content/toast';
import { deps, enterAndFire, flush } from '@tests/_helpers/page-translate';

const NO_BACKEND = 'No backend is set up yet. Open Settings → Backends and add an API key.';

function toast(): HTMLElement | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  return root?.querySelector<HTMLElement>('[data-ega-toast-wrap]') ?? null;
}

function progressHandle(settle: ProgressHandle['settle']): ProgressHandle {
  return {
    update: vi.fn(),
    ...(settle ? { settle } : {}),
    setLiveMessage: vi.fn(),
    setOnClose: vi.fn(),
    setOnToggleOriginal: vi.fn(),
    dismiss: vi.fn(),
  };
}

async function fireTwo(settle = vi.fn()): Promise<string[]> {
  document.body.innerHTML =
    '<p id="a">これは最初の段落です。</p><p id="b">これは二つ目の段落です。</p>';
  const ids: string[] = [];
  const dispatch = vi.fn((requestId: string) => {
    ids.push(requestId);
    return Promise.resolve();
  });
  await enterAndFire(deps({ dispatch, mountProgress: () => progressHandle(settle) }), ['a', 'b']);
  return ids;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  rendererOwner.clear();
  dismissToast();
  await cancelPageTranslateV2();
  vi.mocked(chrome.runtime.sendMessage).mockClear();
});

afterEach(async () => {
  dismissToast();
  await cancelPageTranslateV2();
});

describe('page translate — a failure the user can fix is said on the page', () => {
  it('shows the first line once per session, with an Open settings action on the named tab', async () => {
    const [a, b] = await fireTwo();
    routePageV2Chunk({
      type: 'error',
      requestId: a ?? '',
      code: 'NO_BACKEND',
      message: `${NO_BACKEND}\nnative: Setup needed`,
    });

    expect(toast()?.textContent).toContain(NO_BACKEND);
    expect(toast()?.textContent).not.toContain('native: Setup needed');
    toast()?.querySelector<HTMLButtonElement>('[data-ega-toast-action]')?.click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'ui:open-options',
      tab: 'backends',
    });

    routePageV2Chunk({
      type: 'error',
      requestId: b ?? '',
      code: 'NO_BACKEND',
      message: NO_BACKEND,
    });
    expect(toast()).toBeNull();
  });

  it('a failed send offers a page reload', async () => {
    document.body.innerHTML = '<p id="a">これは最初の段落です。</p>';
    const dispatch = vi.fn(() => Promise.reject(new Error('Extension context invalidated.')));
    await enterAndFire(deps({ dispatch }), ['a']);
    await flush();

    expect(toast()?.querySelector('[data-ega-toast-action]')?.textContent).toBe('Reload page');
  });

  it('says nothing for a failure no setting or reload fixes', async () => {
    const [a] = await fireTwo();
    routePageV2Chunk({ type: 'error', requestId: a ?? '', code: 'UNKNOWN', message: 'boom' });
    expect(toast()).toBeNull();
  });
});

describe('page translate — the settled pill', () => {
  it('names the reason when every block failed the same way', async () => {
    const settle = vi.fn();
    const [a, b] = await fireTwo(settle);
    routePageV2Chunk({ type: 'error', requestId: a ?? '', code: 'AUTH', message: 'bad key' });
    routePageV2Chunk({ type: 'error', requestId: b ?? '', code: 'AUTH', message: 'bad key' });
    expect(settle).toHaveBeenLastCalledWith(
      expect.objectContaining({ failed: 2, failedLabel: 'Authentication failed' }),
    );
  });

  it('names no reason when the failures differ', async () => {
    const settle = vi.fn();
    const [a, b] = await fireTwo(settle);
    routePageV2Chunk({ type: 'error', requestId: a ?? '', code: 'AUTH', message: 'bad key' });
    routePageV2Chunk({ type: 'error', requestId: b ?? '', code: 'UNKNOWN', message: 'boom' });
    const last = settle.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
    expect(last?.['failed']).toBe(2);
    expect(last).not.toHaveProperty('failedLabel');
  });
});
