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

describe('About — "Delete all data" consent text', () => {
  beforeEach(() => {
    resetChromeMock();
    confirmSpy.mockClear();
  });

  it('names everything chrome.storage.local.clear() destroys', async () => {
    const { container } = render(About);
    await new Promise((r) => setTimeout(r, 50));
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
    await new Promise((r) => setTimeout(r, 50));
    const purge = Array.from(container.querySelectorAll('button')).find((b) =>
      /delete all data/i.test(b.textContent),
    );
    if (!purge) throw new Error('purge button not found');

    await fireEvent.click(purge);
    await new Promise((r) => setTimeout(r, 50));

    for (const key of OPTIONS_LOCAL_UI_KEYS) expect(localStorage.getItem(key)).toBeNull();
  });
});
