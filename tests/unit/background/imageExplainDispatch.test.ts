import { describe, it, expect, vi } from 'vitest';
import {
  dispatchImageTranslate,
  type ImageTranslateDispatchDeps,
} from '@/background/imageTranslateDispatch';
import type { Settings } from '@/shared/types';

const tooltipSettings = { imageTranslateSurface: 'tooltip' } as unknown as Settings;

describe('dispatchImageTranslate task=explain', () => {
  it('routes to handleImageExplain, not handleImageTranslate', async () => {
    const handleImageExplain = vi.fn(async () => {});
    const handleImageTranslate = vi.fn(async () => {});
    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: 'https://i.redd.it/x.png',
      task: 'explain',
      getSettings: async () => tooltipSettings,
      router: {
        handleImageTranslate,
        handleImageExplain,
      } satisfies ImageTranslateDispatchDeps['router'],
      broadcast: vi.fn(),
      sendToTab: vi.fn(),
      logger: { error: vi.fn() },
    });
    expect(handleImageExplain).toHaveBeenCalledOnce();
    expect(handleImageTranslate).not.toHaveBeenCalled();
  });

  it('defaults to handleImageTranslate when task is omitted', async () => {
    const handleImageExplain = vi.fn(async () => {});
    const handleImageTranslate = vi.fn(async () => {});
    await dispatchImageTranslate({
      tabId: 1,
      imageUrl: 'https://i.redd.it/x.png',
      getSettings: async () => tooltipSettings,
      router: {
        handleImageTranslate,
        handleImageExplain,
      } satisfies ImageTranslateDispatchDeps['router'],
      broadcast: vi.fn(),
      sendToTab: vi.fn(),
      logger: { error: vi.fn() },
    });
    expect(handleImageTranslate).toHaveBeenCalledOnce();
    expect(handleImageExplain).not.toHaveBeenCalled();
  });
});
