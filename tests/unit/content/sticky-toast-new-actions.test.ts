// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { ensureSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import * as accum from '@/content/accumulator';
// Static so the lazy tooltip import resolves off the warm module graph, not mid-teardown.
import '@/content/tipState.svelte';

vi.mock('@/content/picker-overlay', () => ({
  enterPickerMode: vi.fn().mockResolvedValue(undefined),
}));

const content = await import('@/content/index');
const { getShadowRoot } = await import('@/content/shadowHost');
const { showToast, dismissToast } = await import('@/content/toast');
const { pending } = await import('@/content/request-state');
const handlers = await import('@/content/translate-handlers');
const { escalateToSidepanel } = await import('@/content/tooltip/handoff');

const RECT = { left: 0, top: 0, right: 1, bottom: 1, x: 0, y: 0, width: 1, height: 1 } as DOMRect;
const deps = { ensureSettings };

function toastText(): string | null {
  return getShadowRoot().querySelector('.ega-toast-text')?.textContent ?? null;
}

beforeEach(async () => {
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS } });
  resetSettingsCacheForTest();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  dismissToast();
});

describe('an in-page notice that waits for the user, and the actions after it (X14)', () => {
  it("a queued join's own notice stays while its translate starts", async () => {
    accum.add({ text: 'a'.repeat(1500), rect: RECT });
    accum.add({ text: 'b'.repeat(1500), rect: RECT });
    chromeMock.runtime.onMessage.emit(
      { kind: 'hotkey:translate' },
      { id: chromeMock.runtime.id },
      () => {},
    );
    await vi.waitFor(() =>
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'translate:start' }),
      ),
    );
    expect(toastText()).toBe("Sent 1 of 2 selections. The rest didn't fit.");
  });

  it.each<[string, (id: string) => Promise<void>]>([
    ['Try again', (id) => handlers.retryTranslate(deps, id)],
    ['a task switch', (id) => handlers.retranslateWithTask(deps, id, 'summarize', 'neutral')],
    ['Explain', (id) => handlers.explainTranslate(deps, id)],
    ['Swap', (id) => handlers.swapTranslate(deps, id)],
  ])('%s in the tooltip closes an older notice', async (_name, run) => {
    await content.startTranslateText('hola amigo', RECT);
    const id = [...pending.keys()].at(-1) as string;
    showToast('Could not open the side panel.', { kind: 'error' });
    await run(id);
    expect(toastText()).toBeNull();
  });

  it('opening the side panel again closes the error the first try left', async () => {
    showToast('Could not open the side panel.', { kind: 'error' });
    await escalateToSidepanel({
      subKind: 'continue',
      text: 'hola',
      sourceLang: 'auto',
      targetLang: 'en',
    });
    expect(toastText()).toBeNull();
  });

  it('a notice the escalation shows itself comes after the close', async () => {
    showToast('Could not open the side panel.', { kind: 'error' });
    (chromeMock.runtime.sendMessage as Mock).mockResolvedValueOnce({
      ok: true,
      imageLeftBehind: true,
    });
    await escalateToSidepanel({
      subKind: 'open-panel',
      text: '',
      sourceLang: 'auto',
      targetLang: 'en',
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(toastText()).toBe("Attach the image in the side panel. Ega can't pass this one along.");
  });
});
