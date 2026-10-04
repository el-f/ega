// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { resetChromeMock } from '../../mocks/chrome';

const { confirmSpy } = vi.hoisted(() => ({
  confirmSpy: vi.fn(async (_opts: { body: string }) => false),
}));
vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: confirmSpy }));

import About from '@/options/tabs/About.svelte';
import { OPTIONS_LOCAL_UI_KEYS } from '@/options/local-ui-keys';
import { toastStore } from '@/shared/components/toastStore';

describe('About — "Delete all data" consent text', () => {
  beforeEach(() => {
    resetChromeMock();
    confirmSpy.mockClear();
  });

  it('names everything chrome.storage.local.clear() destroys', async () => {
    const { container } = render(About);
    const buttons = Array.from(container.querySelectorAll('button'));
    const purge = buttons.find((b) => /delete all data/i.test(b.textContent));
    if (!purge) throw new Error('purge button not found');

    await fireEvent.click(purge);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const body = String(confirmSpy.mock.calls[0]?.[0]?.body);
    for (const noun of [
      /settings/i,
      /API keys/i,
      /custom languages/i,
      /glossary/i,
      /conversations/i,
      /audit log/i,
    ]) {
      expect(body).toMatch(noun);
    }
  });

  it('also drops the options UI state kept outside chrome.storage', async () => {
    confirmSpy.mockResolvedValueOnce(true);
    for (const key of OPTIONS_LOCAL_UI_KEYS) localStorage.setItem(key, '1');

    const { container } = render(About);
    const purge = Array.from(container.querySelectorAll('button')).find((b) =>
      /delete all data/i.test(b.textContent),
    );
    if (!purge) throw new Error('purge button not found');

    await fireEvent.click(purge);

    await vi.waitFor(() => {
      for (const key of OPTIONS_LOCAL_UI_KEYS) expect(localStorage.getItem(key)).toBeNull();
    });
  });
});

describe('About — feedback after Clear cache and Delete all data', () => {
  beforeEach(() => {
    resetChromeMock();
    confirmSpy.mockClear();
  });

  function button(container: HTMLElement, name: RegExp): HTMLButtonElement {
    const b = Array.from(container.querySelectorAll('button')).find((x) =>
      name.test(x.textContent),
    );
    if (!b) throw new Error(`no ${String(name)} button`);
    return b;
  }

  it('Clear cache confirms with a success toast', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    confirmSpy.mockResolvedValueOnce(true);
    const { container } = render(About);
    await fireEvent.click(button(container, /clear cache/i));
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Translation cache cleared.', variant: 'success' }),
      ),
    );
    push.mockRestore();
  });

  it('a failed Clear cache says so instead of failing silently', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    vi.spyOn(chrome.runtime, 'sendMessage').mockRejectedValueOnce(new Error('worker gone'));
    confirmSpy.mockResolvedValueOnce(true);
    const { container } = render(About);
    await fireEvent.click(button(container, /clear cache/i));
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'danger',
          message: expect.stringMatching(/worker gone/),
        }),
      ),
    );
    push.mockRestore();
  });

  it('a failed Delete all data says what to do next', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    vi.spyOn(chrome.storage.local, 'clear').mockRejectedValueOnce(new Error('quota'));
    confirmSpy.mockResolvedValueOnce(true);
    const { container } = render(About);
    await fireEvent.click(button(container, /delete all data/i));
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'danger',
          message: expect.stringMatching(/quota.*Delete all data again/),
        }),
      ),
    );
    push.mockRestore();
  });
});
