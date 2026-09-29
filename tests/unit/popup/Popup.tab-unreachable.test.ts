// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Popup from '@/popup/Popup.svelte';

const NO_RECEIVER = 'Could not establish connection. Receiving end does not exist.';
const reload = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  const query = chrome.tabs.query as unknown as Mock;
  query.mockResolvedValue([{ id: 42, url: 'https://example.com/' }]);
  Object.defineProperty(chrome.tabs, 'reload', { configurable: true, value: reload });
});

afterEach(() => {
  const send = chrome.tabs.sendMessage as unknown as Mock;
  send.mockReset();
  send.mockResolvedValue({ ok: true });
  vi.clearAllMocks();
});

function tabRejects(message: string): void {
  const send = chrome.tabs.sendMessage as unknown as Mock;
  send.mockRejectedValue(new Error(message));
}

describe('Popup — a tab with no live content script', () => {
  it('Translate page tells the user to reload and offers a Reload action on that tab', async () => {
    tabRejects(NO_RECEIVER);
    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: /Translate this page/i }));

    expect(await findByText(/Reload the page and try again/i)).toBeTruthy();
    await fireEvent.click(await findByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalledWith(42);
  });

  it('Pick element gets the same reload hint', async () => {
    tabRejects(NO_RECEIVER);
    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: 'Pick element' }));

    expect(await findByText(/Reload the page and try again/i)).toBeTruthy();
  });

  it('any other failure keeps the plain message', async () => {
    tabRejects('Something else broke');
    const { findByRole, findByText, queryByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: /Translate this page/i }));

    expect(await findByText('Could not start page translation.')).toBeTruthy();
    expect(queryByText(/Reload the page/i)).toBeNull();
  });
});
