import { describe, it, expect, vi } from 'vitest';
import {
  openSidePanelWithHandoff,
  type OpenSidePanelHandoff,
} from '@/background/openSidePanelHandoff';
import { IMAGE_DATA_URL_MAX_CHARS } from '@/shared/constants';

const handoff: OpenSidePanelHandoff = {
  sourceText: 'hola',
  sourceLang: 'es',
  targetLang: 'en',
  task: 'translate',
  tone: 'neutral',
};

function tick(): Promise<void> {
  return Promise.resolve();
}

describe('openSidePanelWithHandoff', () => {
  it('opens before the handoff write resolves, inside the gesture window', async () => {
    let resolveWrite!: () => void;
    const writeHandoff = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolveWrite = r;
        }),
    );
    const openSidePanel = vi.fn(() => Promise.resolve());

    const resultP = openSidePanelWithHandoff({
      handoff,
      tabId: 5,
      writeHandoff,
      openSidePanel,
      queryActiveTabId: () => Promise.resolve(undefined),
      logError: () => {},
    });

    await tick();

    // open() fired while the write promise is still pending — fails with the
    // old await-write-first order.
    expect(openSidePanel).toHaveBeenCalledWith({ tabId: 5 });
    expect(writeHandoff).toHaveBeenCalledTimes(1);

    resolveWrite();
    await expect(resultP).resolves.toEqual({ ok: true });
  });

  it('does not call writeHandoff when no handoff is given but still opens', async () => {
    const writeHandoff = vi.fn(() => Promise.resolve());
    const openSidePanel = vi.fn(() => Promise.resolve());

    const result = await openSidePanelWithHandoff({
      tabId: 7,
      writeHandoff,
      openSidePanel,
      queryActiveTabId: () => Promise.resolve(undefined),
      logError: () => {},
    });

    expect(writeHandoff).not.toHaveBeenCalled();
    expect(openSidePanel).toHaveBeenCalledWith({ tabId: 7 });
    expect(result).toEqual({ ok: true });
  });

  it('falls back to the active tab when sender has no tab id', async () => {
    const openSidePanel = vi.fn(() => Promise.resolve());
    const queryActiveTabId = vi.fn(() => Promise.resolve(42));

    const result = await openSidePanelWithHandoff({
      tabId: undefined,
      writeHandoff: () => Promise.resolve(),
      openSidePanel,
      queryActiveTabId,
      logError: () => {},
    });

    expect(queryActiveTabId).toHaveBeenCalledTimes(1);
    expect(openSidePanel).toHaveBeenCalledWith({ tabId: 42 });
    expect(result).toEqual({ ok: true });
  });

  it('does not open when no tab id is resolvable, still reports ok', async () => {
    const openSidePanel = vi.fn(() => Promise.resolve());

    const result = await openSidePanelWithHandoff({
      tabId: undefined,
      writeHandoff: () => Promise.resolve(),
      openSidePanel,
      queryActiveTabId: () => Promise.resolve(undefined),
      logError: () => {},
    });

    expect(openSidePanel).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it('writes an image for the composer only when the panel may render it', async () => {
    const writeHandoff = vi.fn(() => Promise.resolve());
    const deps = {
      tabId: 5,
      writeHandoff,
      openSidePanel: () => Promise.resolve(),
      queryActiveTabId: () => Promise.resolve(undefined),
      logError: () => {},
    };
    const attach = (imageDataUrl: string): OpenSidePanelHandoff => ({
      ...handoff,
      sourceText: '',
      imageDataUrl,
      attachImage: true,
    });

    await openSidePanelWithHandoff({ ...deps, handoff: attach('https://example.com/a.png') });
    await openSidePanelWithHandoff({ ...deps, handoff: attach('data:image/png;base64,AAAA') });
    expect(writeHandoff).toHaveBeenCalledTimes(2);

    writeHandoff.mockClear();
    for (const bad of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'http://169.254.169.254/a.png',
    ]) {
      // The panel still opens, and the reply says the image stayed behind so the page can say so.
      await expect(openSidePanelWithHandoff({ ...deps, handoff: attach(bad) })).resolves.toEqual({
        ok: true,
        imageLeftBehind: true,
      });
    }
    expect(writeHandoff).not.toHaveBeenCalled();
  });

  it('does not write an image the panel reader would drop for size', async () => {
    const writeHandoff = vi.fn(() => Promise.resolve());
    const openSidePanel = vi.fn(() => Promise.resolve());
    const deps = {
      tabId: 5,
      writeHandoff,
      openSidePanel,
      queryActiveTabId: () => Promise.resolve(undefined),
      logError: () => {},
    };
    const head = 'data:image/png;base64,';
    const sized = (chars: number): OpenSidePanelHandoff => ({
      ...handoff,
      sourceText: '',
      imageDataUrl: head + 'A'.repeat(chars - head.length),
      attachImage: true,
    });

    await expect(
      openSidePanelWithHandoff({ ...deps, handoff: sized(IMAGE_DATA_URL_MAX_CHARS) }),
    ).resolves.toEqual({ ok: true });
    expect(writeHandoff).toHaveBeenCalledTimes(1);

    writeHandoff.mockClear();
    // Under the 5 MB fetch cap, so validateImageSrc alone lets it through.
    await expect(
      openSidePanelWithHandoff({ ...deps, handoff: sized(IMAGE_DATA_URL_MAX_CHARS + 1) }),
    ).resolves.toEqual({ ok: true, imageLeftBehind: true });
    expect(writeHandoff).not.toHaveBeenCalled();
    expect(openSidePanel).toHaveBeenCalledTimes(2);
  });

  it('returns ok:false and logs when openSidePanel rejects', async () => {
    const err = new Error('may only be called in response to a user gesture');
    const logError = vi.fn();

    const result = await openSidePanelWithHandoff({
      handoff,
      tabId: 5,
      writeHandoff: () => Promise.resolve(),
      openSidePanel: () => Promise.reject(err),
      queryActiveTabId: () => Promise.resolve(undefined),
      logError,
    });

    expect(logError).toHaveBeenCalledWith(err);
    expect(result).toEqual({ ok: false });
  });
});
