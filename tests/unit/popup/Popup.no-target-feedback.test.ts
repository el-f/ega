// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import Popup from '@/popup/Popup.svelte';
import { readPopupDraft } from '@/shared/pending-popup-draft';
import { flushAsync } from '@tests/_helpers/async';

afterEach(() => {
  vi.clearAllMocks();
});

/** The 150 ms debounced draft write has landed with this text. */
async function draftSaved(text: string): Promise<void> {
  await vi.waitFor(async () => expect((await readPopupDraft())?.text).toBe(text));
}

function onlyChromeTabs(): void {
  const query = chrome.tabs.query as unknown as Mock;
  query.mockResolvedValue([{ id: 9, url: 'chrome://extensions/' }]);
}

describe('Popup — nothing to act on', () => {
  it('says so when Pick has no page to pick from', async () => {
    onlyChromeTabs();
    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: 'Pick element' }));
    expect(await findByText(/open a regular website tab/i)).toBeTruthy();
  });

  it('says so when the side panel cannot open', async () => {
    onlyChromeTabs();
    const { container, findByRole, findByText } = render(Popup);
    await findByRole('button', { name: 'Pick element' });
    const tile = container.querySelector<HTMLButtonElement>(
      '[data-ega-popup-tools] button[aria-label="Open side panel"]',
    );
    if (!tile) throw new Error('panel tile not rendered');
    await fireEvent.click(tile);
    expect(await findByText(/open a regular website tab/i)).toBeTruthy();
  });

  it('freeform send explains the missing tab and that the text is kept', async () => {
    onlyChromeTabs();
    const { container, findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByText(/Translate something/i));
    await tick();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'hola' } });
    await fireEvent.click(await findByRole('button', { name: /Open in side panel/i }));
    expect(await findByText(/The side panel needs a browser tab/i)).toBeTruthy();
    expect(await findByText(/Your text is kept/i)).toBeTruthy();
  });

  it('never dispatches to a tab the user is not looking at', async () => {
    const query = chrome.tabs.query as unknown as Mock;
    query.mockImplementation(async (q: chrome.tabs.QueryInfo) =>
      q.active === true ? [] : [{ id: 77, url: 'https://background-window.example/' }],
    );
    const sendToTab = chrome.tabs.sendMessage as unknown as Mock;

    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: 'Pick element' }));

    expect(await findByText(/open a regular website tab/i)).toBeTruthy();
    expect(sendToTab).not.toHaveBeenCalled();
  });

  it('keeps the freeform draft when the handoff write fails', async () => {
    const query = chrome.tabs.query as unknown as Mock;
    query.mockResolvedValue([{ id: 42, url: 'https://example.com/' }]);
    const open = vi.fn().mockResolvedValue(undefined);
    const realSidePanel = chrome.sidePanel;
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open, setPanelBehavior: vi.fn() },
    });
    const session = chrome.storage.session as unknown as {
      set: (items: Record<string, unknown>) => Promise<void>;
    };
    const realSet = session.set.bind(session);
    const setSpy = vi.spyOn(session, 'set').mockImplementation(async (items) => {
      if (Object.keys(items).includes('ega.pendingPopupHandoff')) throw new Error('QUOTA_BYTES');
      await realSet(items);
    });

    const { container, findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByText(/Translate something/i));
    await tick();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'keep me too' } });
    await draftSaved('keep me too');
    await fireEvent.click(await findByRole('button', { name: /Open in side panel/i }));

    expect(await findByText(/Could not open the side panel/i)).toBeTruthy();
    // The toast comes from the failed send itself, so one flush lets that send finish.
    await flushAsync();
    expect(open).not.toHaveBeenCalled();
    expect((await readPopupDraft())?.text).toBe('keep me too');

    setSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('keeps the freeform draft when the send fails', async () => {
    onlyChromeTabs();
    const { container, findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByText(/Translate something/i));
    await tick();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'keep me' } });
    // The draft write is debounced; let it land before the failing send.
    await draftSaved('keep me');
    await fireEvent.click(await findByRole('button', { name: /Open in side panel/i }));
    expect(await findByText(/The side panel needs a browser tab/i)).toBeTruthy();
    await flushAsync();
    expect((await readPopupDraft())?.text).toBe('keep me');
  });
});

describe('Popup — clipboard tile feedback', () => {
  it('clipboard with text + no web tab explains the missing tab, not the page', async () => {
    onlyChromeTabs();
    const readText = navigator.clipboard.readText as unknown as Mock;
    readText.mockResolvedValueOnce('hola mundo');

    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: /Translate clipboard contents/i }));

    expect(await findByText(/The side panel needs a browser tab/i)).toBeTruthy();
    expect(await findByText(/Your text is still on the clipboard/i)).toBeTruthy();
  });

  it('says the clipboard is empty instead of silently opening the panel', async () => {
    const readText = navigator.clipboard.readText as unknown as Mock;
    readText.mockResolvedValueOnce('   ');
    const open = chrome.sidePanel.open as unknown as Mock;

    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: /Translate clipboard contents/i }));

    expect(await findByText(/Clipboard is empty/i)).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });

  it('says when the clipboard cannot be read', async () => {
    const readText = navigator.clipboard.readText as unknown as Mock;
    readText.mockRejectedValueOnce(new Error('denied'));
    const open = chrome.sidePanel.open as unknown as Mock;

    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: /Translate clipboard contents/i }));

    expect(await findByText(/cannot read your clipboard/i)).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });

  it('requests the optional clipboardRead permission in the click and stops on deny', async () => {
    const contains = chrome.permissions.contains as unknown as Mock;
    const request = chrome.permissions.request as unknown as Mock;
    contains.mockResolvedValueOnce(false);
    request.mockResolvedValueOnce(false);
    const readText = navigator.clipboard.readText as unknown as Mock;

    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: /Translate clipboard contents/i }));

    expect(request).toHaveBeenCalledWith({ permissions: ['clipboardRead'] });
    expect(await findByText(/Clipboard access was denied/i)).toBeTruthy();
    expect(readText).not.toHaveBeenCalled();
  });

  it('a granted permission request falls through to the clipboard read', async () => {
    const contains = chrome.permissions.contains as unknown as Mock;
    const request = chrome.permissions.request as unknown as Mock;
    contains.mockResolvedValueOnce(false);
    request.mockResolvedValueOnce(true);
    const readText = navigator.clipboard.readText as unknown as Mock;
    readText.mockResolvedValueOnce('   ');

    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: /Translate clipboard contents/i }));

    expect(await findByText(/Clipboard is empty/i)).toBeTruthy();
  });
});
