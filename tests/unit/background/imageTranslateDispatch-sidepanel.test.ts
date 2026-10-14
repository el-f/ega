import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchImageTranslate,
  type ImageTranslateDispatchDeps,
} from '@/background/imageTranslateDispatch';
import { STORAGE_KEYS } from '@/shared/constants';
import type { Msg } from '@/shared/messages';
import type { Settings } from '@/shared/types';

const sidepanelSettings = {
  imageTranslateSurface: 'sidepanel',
} as unknown as Settings;

function baseDeps(overrides: Partial<ImageTranslateDispatchDeps> = {}): ImageTranslateDispatchDeps {
  return {
    tabId: 1,
    imageUrl: 'https://i.redd.it/x.png',
    requestId: 'req-1',
    getSettings: async () => sidepanelSettings,
    router: {
      handleImageTranslate: vi.fn(async () => {}),
      handleImageExplain: vi.fn(async () => {}),
    },
    broadcast: vi.fn(),
    sendToTab: vi.fn(),
    logger: { error: vi.fn() },
    ...overrides,
  };
}

describe('dispatchImageTranslate sidepanel surface', () => {
  beforeEach(async () => {
    await chrome.storage.session.remove(STORAGE_KEYS.pendingImageSeed);
  });

  it('broadcasts an error chunk when runVision throws (seeded turn would hang otherwise)', async () => {
    const broadcast = vi.fn();
    const deps = baseDeps({
      broadcast,
      router: {
        handleImageTranslate: vi.fn(async () => {
          throw new Error('vision blew up');
        }),
        handleImageExplain: vi.fn(async () => {}),
      },
    });
    await dispatchImageTranslate(deps);

    const errorChunk = broadcast.mock.calls
      .map((c) => c[0] as Msg)
      .find(
        (m): m is Extract<Msg, { kind: 'translate:chunk' }> =>
          m.kind === 'translate:chunk' && m.chunk.type === 'error',
      );
    expect(errorChunk).toBeDefined();
    expect(errorChunk?.chunk).toMatchObject({
      type: 'error',
      requestId: 'req-1',
      code: 'UNKNOWN',
      message: 'vision blew up',
    });
    expect(deps.logger.error).toHaveBeenCalledOnce();
  });
});
