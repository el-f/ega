// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import Popup from '@/popup/Popup.svelte';
import { MAX_SELECTION_CHARS } from '@/shared/constants';

// Launcher shell — popup never translates inline. These tests pin the
// trigger grid surface + freeform-expand handoff path + lang-pair wiring.

afterEach(() => {
  vi.clearAllMocks();
});

describe('Popup launcher shell', () => {
  it('mounts the four trigger tiles + lang pair without rendering a hero textarea by default', async () => {
    const { container, findByRole, queryByPlaceholderText } = render(Popup);
    await findByRole('button', { name: /Translate this page/i });
    expect(container.querySelector('[data-ega-lang-pair]')).not.toBeNull();
    expect(container.querySelector('[data-ega-popup-tools]')).not.toBeNull();
    expect(container.querySelector('[data-ega-freeform-collapsed]')).not.toBeNull();
    // No hero textarea on default surface — freeform is collapsed.
    expect(queryByPlaceholderText(/Paste or type/i)).toBeNull();
  });

  it('mounts a Toaster so page-translate feedback has somewhere to land', async () => {
    const { findByRole } = render(Popup);
    await findByRole('button', { name: /Translate this page/i });
    // svelte-sonner renders the toast list lazily; the container section is
    // always present once the Toaster mounts.
    expect(await findByRole('region', { name: /Notifications/i })).toBeTruthy();
  });

  it('mounts the cycle theme toggle in the popup header', async () => {
    const { container, findByRole } = render(Popup);
    await findByRole('button', { name: /Translate this page/i });
    expect(container.querySelector('[data-ega-theme-toggle]')).not.toBeNull();
  });
});

describe('Popup freeform expand', () => {
  it('clicking the collapsed entry expands the textarea + Send button', async () => {
    const { container, findByRole, findByText } = render(Popup);
    const collapsed = (await findByText(/Translate something/i)) as HTMLButtonElement;
    await fireEvent.click(collapsed);
    await tick();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    expect(await findByRole('button', { name: /Send to panel/i })).toBeTruthy();
  });

  it('Send to panel writes the handoff slot + opens the sidepanel', async () => {
    const tabsQuery = chrome.tabs.query as unknown as Mock;
    tabsQuery.mockResolvedValue([{ id: 77, url: 'https://example.com/' }]);
    const sidePanelOpen = vi.fn().mockResolvedValue(undefined);
    const realSidePanel = chrome.sidePanel;
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: sidePanelOpen, setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole, findByText, container } = render(Popup);
    await fireEvent.click(await findByText(/Translate something/i));
    await tick();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'ahlan sadeeqi' } });
    await fireEvent.click(await findByRole('button', { name: /Send to panel/i }));

    // Allow the handoff write + sidePanel.open chain to flush.
    await new Promise((r) => setTimeout(r, 10));

    const stored = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
      string,
      Record<string, { sourceText: string; task: string; tone: string }> | undefined
    >;
    const queue = stored['ega.pendingPopupHandoff'];
    expect(queue).toBeDefined();
    const entries = Object.values(queue ?? {});
    expect(entries.length).toBe(1);
    expect(entries[0]?.sourceText).toBe('ahlan sadeeqi');
    expect(sidePanelOpen).toHaveBeenCalledWith({ tabId: 77 });

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('Send cancels the pending draft-save timer so the sent text is not restored', async () => {
    const tabsQuery = chrome.tabs.query as unknown as Mock;
    tabsQuery.mockResolvedValue([{ id: 88, url: 'https://example.com/' }]);
    const realSidePanel = chrome.sidePanel;
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: vi.fn().mockResolvedValue(undefined), setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { container, findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByText(/Translate something/i));
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'ana bahibbak' } });
    // The debounce only arms after hydration, so wait for the draft it writes
    // rather than guessing how long onMount takes.
    await vi.waitFor(async () => {
      const armed = (await chrome.storage.session.get('ega.popupDraft')) as Record<
        string,
        { text?: string } | undefined
      >;
      expect(armed['ega.popupDraft']?.text).toBe('ana bahibbak');
    });

    await fireEvent.click(await findByRole('button', { name: /Send to panel/i }));
    // Past the 150 ms debounce — a surviving timer would rewrite the sent text.
    await new Promise((r) => setTimeout(r, 250));

    const stored = (await chrome.storage.session.get('ega.popupDraft')) as Record<
      string,
      { text?: string } | undefined
    >;
    // The composer stays expanded across reopens, so an empty-text draft may
    // persist; what must not survive is the text that was just sent.
    expect(stored['ega.popupDraft']?.text ?? '').toBe('');

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('clamps an over-limit freeform send to the handoff cap and says so', async () => {
    const tabsQuery = chrome.tabs.query as unknown as Mock;
    tabsQuery.mockResolvedValue([{ id: 77, url: 'https://example.com/' }]);
    const realSidePanel = chrome.sidePanel;
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: vi.fn().mockResolvedValue(undefined), setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole, findByText, container } = render(Popup);
    await fireEvent.click(await findByText(/Translate something/i));
    await tick();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'x'.repeat(MAX_SELECTION_CHARS + 100) } });
    await fireEvent.click(await findByRole('button', { name: /Send to panel/i }));
    await new Promise((r) => setTimeout(r, 10));

    expect(await findByText(new RegExp(`first ${MAX_SELECTION_CHARS} characters`))).toBeTruthy();
    const stored = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
      string,
      Record<string, { sourceText: string }> | undefined
    >;
    const entries = Object.values(stored['ega.pendingPopupHandoff'] ?? {});
    expect(entries.length).toBe(1);
    expect(entries[0]?.sourceText.length).toBe(MAX_SELECTION_CHARS);
    // Trimmed sends keep the popup open so the toast stays readable.
    expect(closeSpy).not.toHaveBeenCalled();

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('clamps an over-limit clipboard to the handoff cap and says so', async () => {
    const tabsQuery = chrome.tabs.query as unknown as Mock;
    tabsQuery.mockResolvedValue([{ id: 77, url: 'https://example.com/' }]);
    const readText = navigator.clipboard.readText as unknown as Mock;
    readText.mockResolvedValueOnce('y'.repeat(MAX_SELECTION_CHARS + 500));
    const realSidePanel = chrome.sidePanel;
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: vi.fn().mockResolvedValue(undefined), setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: /Translate clipboard contents/i }));
    await new Promise((r) => setTimeout(r, 10));

    expect(await findByText(new RegExp(`first ${MAX_SELECTION_CHARS} characters`))).toBeTruthy();
    const stored = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
      string,
      Record<string, { sourceText: string }> | undefined
    >;
    const entries = Object.values(stored['ega.pendingPopupHandoff'] ?? {});
    expect(entries.length).toBe(1);
    expect(entries[0]?.sourceText.length).toBe(MAX_SELECTION_CHARS);
    expect(closeSpy).not.toHaveBeenCalled();

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('Send is disabled when the freeform textarea is whitespace-only', async () => {
    const { container, findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByText(/Translate something/i));
    await tick();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: '   \n  ' } });
    const send = (await findByRole('button', { name: /Send to panel/i })) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });
});

describe('Popup auto-fill from active-tab selection', () => {
  it('pre-fills + auto-expands the freeform when an active-tab selection lands', async () => {
    const tabsQuery = chrome.tabs.query as unknown as Mock;
    const tabsSend = chrome.tabs.sendMessage as unknown as Mock;
    tabsQuery.mockResolvedValue([{ id: 42, url: 'https://example.com/' }]);
    tabsSend.mockImplementation(async (_tabId: number, msg: unknown) => {
      if ((msg as { kind?: string }).kind === 'ega:get-selection') {
        return { text: 'yalla habibi' };
      }
      return { ok: true };
    });
    const { findByDisplayValue } = render(Popup);
    const ta = (await findByDisplayValue('yalla habibi')) as HTMLTextAreaElement;
    expect(ta.dataset['egaFreeformTextarea']).toBeDefined();
  });
});

describe('Popup source<->target swap', () => {
  it('clicking swap exchanges the bound source and target values', async () => {
    const { container, findByLabelText } = render(Popup);
    await findByLabelText(/swap/i);
    const selects = container.querySelectorAll(
      '[data-ega-lang-pair] select',
    ) as NodeListOf<HTMLSelectElement>;
    expect(selects.length).toBe(2);
    const [fromSelect, toSelect] = [selects[0], selects[1]] as [
      HTMLSelectElement,
      HTMLSelectElement,
    ];
    await fireEvent.change(fromSelect, { target: { value: 'es' } });
    await tick();
    await fireEvent.change(toSelect, { target: { value: 'fr' } });
    await tick();
    expect(fromSelect.value).toBe('es');
    expect(toSelect.value).toBe('fr');
    const swap = (await findByLabelText(/swap/i)) as HTMLButtonElement;
    await fireEvent.click(swap);
    await tick();
    expect(fromSelect.value).toBe('fr');
    expect(toSelect.value).toBe('es');
  });
});

describe('Popup — a rejected settings write', () => {
  it('puts the target language back and says the change was not saved', async () => {
    const send = chrome.runtime.sendMessage as unknown as Mock;
    send.mockImplementation(async (msg: unknown) => {
      if ((msg as { kind?: string }).kind === 'settings:update') {
        return { ok: false, reason: 'quota' };
      }
      return { ok: true };
    });

    const { container, findByLabelText, findByText } = render(Popup);
    await findByLabelText(/swap/i);
    const selects = container.querySelectorAll(
      '[data-ega-lang-pair] select',
    ) as NodeListOf<HTMLSelectElement>;
    const toSelect = selects[1] as HTMLSelectElement;
    const before = toSelect.value;

    await fireEvent.change(toSelect, { target: { value: 'fr' } });
    await new Promise((r) => setTimeout(r, 10));

    expect(await findByText(/Storage is full|not saved/i)).toBeTruthy();
    expect(toSelect.value).toBe(before);
  });
});

describe('Popup — settings listener cleanup', () => {
  it('removes the onSettingsChanged listener when the popup unmounts', async () => {
    // Count onChanged adds and removes: unmount must unsubscribe.
    const onChanged = chrome.storage.local.onChanged as unknown as {
      addListener: (fn: (...a: unknown[]) => void) => void;
      removeListener: (fn: (...a: unknown[]) => void) => void;
      hasListener: (fn: (...a: unknown[]) => void) => boolean;
    };
    const added: Array<(...a: unknown[]) => void> = [];
    const origAdd = onChanged.addListener;
    onChanged.addListener = (fn) => {
      added.push(fn);
      origAdd.call(onChanged, fn);
    };

    const { findByRole, unmount } = render(Popup);
    await findByRole('button', { name: /Translate this page/i });
    // Flush onMount + the awaited getSettings chain.
    await new Promise((r) => setTimeout(r, 10));

    expect(added.length).toBeGreaterThanOrEqual(1);
    const before = added.filter((fn) => onChanged.hasListener(fn)).length;
    expect(before).toBeGreaterThanOrEqual(1);

    unmount();
    // Cleanup runs synchronously on unmount; the listener must be gone.
    const after = added.filter((fn) => onChanged.hasListener(fn)).length;
    expect(after).toBe(0);

    onChanged.addListener = origAdd;
  });
});

describe('Popup — translate this page button', () => {
  it('clicking "Translate this page" sends page:translateAll to the active tab', async () => {
    const sendToTab = chrome.tabs.sendMessage as unknown as Mock;
    sendToTab.mockResolvedValue(undefined);
    const query = chrome.tabs.query as unknown as Mock;
    query.mockResolvedValue([{ id: 42, url: 'https://example.com/' }]);
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole } = render(Popup);
    const btn = (await findByRole('button', {
      name: /translate this page/i,
    })) as HTMLButtonElement;
    await fireEvent.click(btn);

    await new Promise((r) => setTimeout(r, 10));
    const call = sendToTab.mock.calls.find(
      (c) => (c[1] as { kind?: string }).kind === 'page:translateAll',
    );
    expect(call).toBeDefined();
    if (!call) throw new Error('no page:translateAll call');
    expect(call[0]).toBe(42);
    expect(call[1]).toEqual({ kind: 'page:translateAll' });
    closeSpy.mockRestore();
  });

  it('surfaces a toast when no injectable tab is available (chrome:// / extension tab)', async () => {
    const query = chrome.tabs.query as unknown as Mock;
    // Only non-injectable tabs present — resolveContentTab returns null.
    query.mockResolvedValue([{ id: 9, url: 'chrome://extensions/' }]);
    const sendToTab = chrome.tabs.sendMessage as unknown as Mock;
    sendToTab.mockResolvedValue(undefined);

    const { findByRole, findByText } = render(Popup);
    const btn = (await findByRole('button', {
      name: /translate this page/i,
    })) as HTMLButtonElement;
    await fireEvent.click(btn);

    expect(await findByText(/No translatable page here/i)).toBeTruthy();
    // No dispatch fired — the click was a feedback-only no-op.
    const dispatched = sendToTab.mock.calls.find(
      (c) => (c[1] as { kind?: string }).kind === 'page:translateAll',
    );
    expect(dispatched).toBeUndefined();
  });
});

describe('Popup composer draft — saved from the input event', () => {
  it('text typed before the draft read finishes is still saved', async () => {
    const { container, findByText } = render(Popup);
    await fireEvent.click(await findByText(/Translate something/i));
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'typed early' } });
    await vi.waitFor(async () => {
      const stored = (await chrome.storage.session.get('ega.popupDraft')) as Record<
        string,
        { text?: string; expanded?: boolean } | undefined
      >;
      expect(stored['ega.popupDraft']).toEqual({ text: 'typed early', expanded: true });
    });
  });

  it('expanding without typing saves the expanded flag', async () => {
    const { findByText } = render(Popup);
    await new Promise((r) => setTimeout(r, 50));
    await fireEvent.click(await findByText(/Translate something/i));
    await vi.waitFor(async () => {
      const stored = (await chrome.storage.session.get('ega.popupDraft')) as Record<
        string,
        { text?: string; expanded?: boolean } | undefined
      >;
      expect(stored['ega.popupDraft']?.expanded).toBe(true);
    });
  });
});
