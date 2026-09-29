// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import Options from '@/options/Options.svelte';

const SETTINGS_KEY = 'ega.settings';

function seedSettings(): void {
  const defaults = parseSettings({});
  chromeMock.storage.local._raw.set(SETTINGS_KEY, defaults);
}

/** Finds the Options keydown handler by a unique source substring, to tell it from Svelte's delegated handlers. */
function isOptionsKeyHandler(fn: unknown): fn is (e: KeyboardEvent) => void {
  return typeof fn === 'function' && /isContentEditable/.test(fn.toString());
}

describe('Options.svelte — unmount cleanup', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('removes the document keydown listener registered by Options on unmount', async () => {
    seedSettings();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(Options);

    // Wait specifically for the Options-registered keydown listener (async
    // onMount races with Svelte's synchronous event-delegation listeners).
    await waitFor(() => {
      const optAdds = addSpy.mock.calls.filter(
        ([type, fn]) => type === 'keydown' && isOptionsKeyHandler(fn),
      );
      expect(optAdds.length).toBeGreaterThan(0);
    });
    const optAdds = addSpy.mock.calls.filter(
      ([type, fn]) => type === 'keydown' && isOptionsKeyHandler(fn),
    );
    expect(optAdds.length).toBe(1);
    const addedHandler = optAdds[0]?.[1];

    unmount();
    await Promise.resolve();
    await Promise.resolve();

    const removed = removeSpy.mock.calls.find(
      ([type, fn]) => type === 'keydown' && fn === addedHandler,
    );
    // An async onMount resolves to a Promise, so its returned cleanup never runs.
    expect(removed).toBeTruthy();
  });

  it('registers the keydown listener even while the initial settings read is pending', async () => {
    seedSettings();
    const getSpy = vi
      .spyOn(chromeMock.storage.local, 'get')
      .mockImplementation(() => new Promise<Record<string, unknown>>(() => {}));
    const addSpy = vi.spyOn(document, 'addEventListener');
    try {
      const { unmount } = render(Options);
      await tick();
      // Registering behind `await getSettings()` lets teardown run first and leak.
      const optAdds = addSpy.mock.calls.filter(
        ([type, fn]) => type === 'keydown' && isOptionsKeyHandler(fn),
      );
      expect(optAdds.length).toBe(1);
      unmount();
    } finally {
      getSpy.mockRestore();
    }
  });
});
