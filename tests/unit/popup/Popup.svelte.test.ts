// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import Popup from '@/popup/Popup.svelte';
import { MAX_SELECTION_CHARS } from '@/shared/constants';
import { flushAsync } from '@tests/_helpers/async';

// The popup never translates inline: every action hands off to the side panel or the page.

beforeEach(async () => {
  // A backend is set up unless a test says otherwise; with none, the page actions are blocked.
  await chrome.storage.local.set({ 'ega.settings': { anthropicApiKey: 'test-key' } });
});

afterEach(() => {
  vi.clearAllMocks();
  // Tests that script a loading tab replace this; the next test starts from a loaded one.
  (chrome.tabs.get as unknown as Mock).mockResolvedValue({ id: 1, url: '' });
});

/** onMount has asked the active tab for its state. */
async function mounted(): Promise<void> {
  await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
}

async function handoffEntries<T>(): Promise<T[]> {
  const stored = (await chrome.storage.session.get('ega.pendingPopupHandoff')) as Record<
    string,
    Record<string, T> | undefined
  >;
  return Object.values(stored['ega.pendingPopupHandoff'] ?? {});
}

function onTab(
  url: string,
  answer: (msg: { kind: string }) => unknown = () => ({ ok: true }),
): {
  sent: Mock;
} {
  (chrome.tabs.query as unknown as Mock).mockResolvedValue([{ id: 42, url }]);
  const sent = chrome.tabs.sendMessage as unknown as Mock;
  sent.mockImplementation(async (_id: number, msg: { kind: string }) => answer(msg));
  return { sent };
}

describe('Popup launcher shell', () => {
  it('shows one filled primary, the page tools and an always-visible labelled text box', async () => {
    onTab('https://example.com/');
    const { container, findByRole, getByLabelText } = render(Popup);
    await findByRole('button', { name: 'Translate page' });
    expect(container.querySelector('[data-ega-lang-pair]')).not.toBeNull();
    expect(await findByRole('toolbar', { name: 'Page tools' })).toBeTruthy();
    const box = getByLabelText('Translate in the side panel') as HTMLTextAreaElement;
    expect(box.placeholder).toBe('Paste or type text');
  });

  it('mounts a Toaster so page-translate feedback has somewhere to land', async () => {
    const { findByRole } = render(Popup);
    await findByRole('button', { name: 'Translate page' });
    expect(await findByRole('region', { name: /Notifications/i })).toBeTruthy();
  });

  it('with no backend, the setup card holds the only filled button and the page actions still run', async () => {
    await chrome.storage.local.remove('ega.settings');
    onTab('https://example.com/');
    const { container, findByRole } = render(Popup);
    const card = await vi.waitFor(() => {
      const el = container.querySelector('[data-ega-popup-no-backend]');
      if (!el) throw new Error('no setup card yet');
      return el;
    });
    expect(card.textContent).toContain('Set up a backend to start.');
    expect(await findByRole('button', { name: 'Set up a backend' })).toBeTruthy();
    // A cold native host can read as not ready, so nothing is blocked; only the filled look moves.
    const primary = await findByRole('button', { name: 'Translate page' });
    await vi.waitFor(() => expect(primary.classList.contains('quiet')).toBe(true));
    expect(primary.hasAttribute('aria-disabled')).toBe(false);
    expect(
      (await findByRole('button', { name: 'Translate clipboard' })).hasAttribute('aria-disabled'),
    ).toBe(false);
  });

  it('leaves the theme to Options, so the header has no theme toggle', async () => {
    const { container, findByRole } = render(Popup);
    await findByRole('button', { name: 'Translate page' });
    expect(container.querySelector('[data-ega-theme-toggle]')).toBeNull();
  });

  it('shows the body only once the page has answered, so no row moves after the first paint', async () => {
    let answer: (v: unknown) => void = () => {};
    onTab('https://example.com/', (msg) =>
      msg.kind === 'ega:get-selection' ? new Promise((r) => (answer = r)) : { ok: true },
    );
    const { container, findByRole } = render(Popup);
    await mounted();
    const body = container.querySelector<HTMLElement>('.popup-body');
    // The switch row and a status line are still unknown: nothing shows yet.
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalled());
    // jsdom applies no component styles; the class is what hides the body (opacity: 0).
    expect(body?.classList.contains('pending')).toBe(true);
    // Out of reach while unseen; inert, not visibility, so focus lands the moment it shows, reduced motion or not.
    expect(body?.inert).toBe(true);
    answer({ text: '', heldBack: { reason: 'english' } });
    await findByRole('switch', { name: 'Ega on example.com' });
    await vi.waitFor(() => expect(body?.classList.contains('pending')).toBe(false));
    expect(body?.inert).toBe(false);
  });

  it('puts focus on Translate page when nothing is prefilled', async () => {
    onTab('https://example.com/');
    const { findByRole } = render(Popup);
    const primary = await findByRole('button', { name: 'Translate page' });
    await vi.waitFor(() => expect(document.activeElement).toBe(primary));
  });
});

describe('Popup site switch and status line', () => {
  it('names the site, without www., and reads its state from settings', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        anthropicApiKey: 'k',
        sitePrefs: { 'https://www.example.com': { disabled: true } },
      },
    });
    onTab('https://www.example.com/a');
    const { findByRole, findByText } = render(Popup);
    const sw = (await findByRole('switch', { name: 'Ega on example.com' })) as HTMLInputElement;
    await vi.waitFor(() => expect(sw.checked).toBe(false));
    expect(await findByText("Ega won't translate on this site.")).toBeTruthy();
    const primary = await findByRole('button', { name: 'Translate page' });
    expect(primary.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(primary.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain("Ega won't translate on this site.");
  });

  it('turning the switch off sends a set for this page, and the status line appears', async () => {
    onTab('https://example.com/page');
    const send = chrome.runtime.sendMessage as unknown as Mock;
    const { findByRole, findByText } = render(Popup);
    const sw = (await findByRole('switch', { name: 'Ega on example.com' })) as HTMLInputElement;
    await vi.waitFor(() => expect(sw.checked).toBe(true));
    await fireEvent.click(sw);
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        kind: 'site:set-enabled',
        enabled: false,
        url: 'https://example.com/page',
      }),
    );
    expect(await findByText("Ega won't translate on this site.")).toBeTruthy();
    expect(sw.checked).toBe(false);
  });

  it('flips back and says so when the write fails', async () => {
    onTab('https://example.com/');
    const send = chrome.runtime.sendMessage as unknown as Mock;
    send.mockImplementation(async (msg: { kind?: string }) =>
      msg.kind === 'site:set-enabled' ? { ok: false } : { ok: true },
    );
    const { findByRole, findByText } = render(Popup);
    const sw = (await findByRole('switch', { name: 'Ega on example.com' })) as HTMLInputElement;
    await fireEvent.click(sw);
    expect(await findByText("Ega couldn't save this change. Try again.")).toBeTruthy();
    await vi.waitFor(() => expect(sw.checked).toBe(true));
  });

  it('flips back when the write never answers', async () => {
    onTab('https://example.com/');
    const send = chrome.runtime.sendMessage as unknown as Mock;
    send.mockImplementation((msg: { kind?: string }) =>
      msg.kind === 'site:set-enabled' ? new Promise(() => {}) : Promise.resolve({ ok: true }),
    );
    const { findByRole } = render(Popup);
    const sw = (await findByRole('switch', { name: 'Ega on example.com' })) as HTMLInputElement;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await fireEvent.click(sw);
      expect(sw.checked).toBe(false);
      await vi.advanceTimersByTimeAsync(2100);
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(sw.checked).toBe(true));
  });

  it.each([
    [{ reason: 'english' }, 'Bubble hidden: the text looks like English.'],
    [
      { reason: 'too-short', minLength: 6 },
      'Bubble hidden: the selection is shorter than 6 characters.',
    ],
    [{ reason: 'mode-never' }, 'The selection bubble is off in Settings.'],
  ])(
    'names why the bubble stayed hidden (%o) and offers Translate anyway',
    async (heldBack, text) => {
      const { sent } = onTab('https://example.com/', (msg) =>
        msg.kind === 'ega:get-selection' ? { text: 'hello there', heldBack } : { ok: true },
      );
      const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);
      const { findByText, findByRole } = render(Popup);
      expect(await findByText(text)).toBeTruthy();
      await fireEvent.click(await findByRole('button', { name: 'Translate anyway' }));
      await vi.waitFor(() =>
        expect(sent).toHaveBeenCalledWith(42, {
          kind: 'ctx:translate-selection',
          text: 'hello there',
        }),
      );
      await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled());
      closeSpy.mockRestore();
    },
  );

  it('on a page extensions cannot run on, hides the switch and blocks the page actions', async () => {
    // What Chrome really hands an extension without the "tabs" permission there: an id, no url.
    (chrome.tabs.query as unknown as Mock).mockResolvedValue([{ id: 42, windowId: 1 }]);
    const sent = chrome.tabs.sendMessage as unknown as Mock;
    const { findByText, findByRole, queryByRole } = render(Popup);
    expect(await findByText("Ega can't run on this page.")).toBeTruthy();
    expect(queryByRole('switch')).toBeNull();
    expect(
      (await findByRole('button', { name: 'Choose areas' })).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(sent).not.toHaveBeenCalled();
  });

  it('the Web Store, whose address Ega can read, is a page it cannot run on too', async () => {
    onTab('https://chromewebstore.google.com/detail/abc');
    const { findByText } = render(Popup);
    expect(await findByText("Ega can't run on this page.")).toBeTruthy();
  });

  it('the popup page opened in its own tab acts on the page tab, not on itself', async () => {
    (chrome.tabs.query as unknown as Mock).mockResolvedValue([{ id: 42, windowId: 1 }]);
    (chrome.tabs.getCurrent as unknown as Mock).mockResolvedValueOnce({ id: 42, windowId: 1 });
    const { findByRole, queryByText } = render(Popup);
    const primary = await findByRole('button', { name: 'Translate page' });
    await mounted();
    await vi.waitFor(() => expect(document.activeElement).toBe(primary));
    expect(queryByText("Ega can't run on this page.")).toBeNull();
    expect(primary.hasAttribute('aria-disabled')).toBe(false);
  });

  it('a page still loading is not called dead: the popup asks again once it loads', async () => {
    const heldBack = { reason: 'english' };
    (chrome.tabs.query as unknown as Mock).mockResolvedValue([
      { id: 42, url: 'https://example.com/', status: 'loading' },
    ]);
    // The content script injects once the page is idle: the first two asks find nobody.
    let asks = 0;
    (chrome.tabs.sendMessage as unknown as Mock).mockImplementation(async () => {
      asks += 1;
      if (asks <= 2)
        throw new Error('Could not establish connection. Receiving end does not exist.');
      return { text: 'hi there', heldBack };
    });
    (chrome.tabs.get as unknown as Mock).mockImplementation(async () => ({
      id: 42,
      status: asks <= 2 ? 'loading' : 'complete',
    }));
    const { findByText, queryByText } = render(Popup);
    expect(
      await findByText('Bubble hidden: the text looks like English.', {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(queryByText('Reload this page to use Ega here.')).toBeNull();
  });

  it('a page action pressed while the page loads waits for it, then runs', async () => {
    (chrome.tabs.query as unknown as Mock).mockResolvedValue([
      { id: 42, url: 'https://example.com/', status: 'complete' },
    ]);
    let loaded = false;
    const sent = chrome.tabs.sendMessage as unknown as Mock;
    sent.mockImplementation(async (_id: number, msg: { kind: string }) => {
      if (msg.kind === 'ega:get-selection') return { text: '' };
      if (!loaded) throw new Error('Could not establish connection. Receiving end does not exist.');
      return { ok: true };
    });
    // The page navigated after the popup asked: it is loading again, then done.
    (chrome.tabs.get as unknown as Mock).mockImplementation(async () => {
      const status = loaded ? 'complete' : 'loading';
      loaded = true;
      return { id: 42, status };
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const { findByRole, queryByText } = render(Popup);
    await mounted();
    await fireEvent.click(await findByRole('button', { name: 'Translate page' }));
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith(42, { kind: 'page:translateAll' }));
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 3000 });
    expect(queryByText('Reload this page to use Ega here.')).toBeNull();
    closeSpy.mockRestore();
  });

  it('says to reload a page whose content script does not answer, and reloads it', async () => {
    onTab('https://example.com/', () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });
    const reload = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(chrome.tabs, 'reload', { configurable: true, value: reload });
    const { findByText, findByRole } = render(Popup);
    expect(await findByText('Reload this page to use Ega here.')).toBeTruthy();
    expect(
      (await findByRole('button', { name: 'Translate page' })).getAttribute('aria-disabled'),
    ).toBe('true');
    await fireEvent.click(await findByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalledWith(42);
  });
});

describe('Popup text box', () => {
  it('Translate writes the handoff slot and opens the side panel', async () => {
    onTab('https://example.com/');
    const sidePanelOpen = vi.fn().mockResolvedValue(undefined);
    const realSidePanel = chrome.sidePanel;
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: sidePanelOpen, setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole, getByLabelText } = render(Popup);
    await mounted();
    const ta = getByLabelText('Translate in the side panel');
    await fireEvent.input(ta, { target: { value: 'ahlan sadeeqi' } });
    await fireEvent.click(await findByRole('button', { name: 'Translate' }));

    await vi.waitFor(() => expect(sidePanelOpen).toHaveBeenCalledWith({ tabId: 42 }));
    const entries = await handoffEntries<{ sourceText: string }>();
    expect(entries.map((e) => e.sourceText)).toEqual(['ahlan sadeeqi']);

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('Send cancels the pending draft-save timer so the sent text is not restored', async () => {
    onTab('https://example.com/');
    const realSidePanel = chrome.sidePanel;
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: vi.fn().mockResolvedValue(undefined), setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { container, findByRole } = render(Popup);
    await mounted();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'ana bahibbak' } });
    await vi.waitFor(async () => {
      const armed = (await chrome.storage.session.get('ega.popupDraft')) as Record<
        string,
        { text?: string } | undefined
      >;
      expect(armed['ega.popupDraft']?.text).toBe('ana bahibbak');
    });

    const send = await findByRole('button', { name: 'Translate' });
    const draftText = async (): Promise<string> => {
      const stored = (await chrome.storage.session.get('ega.popupDraft')) as Record<
        string,
        { text?: string } | undefined
      >;
      return stored['ega.popupDraft']?.text ?? '';
    };

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Svelte arms its own 0 ms event timer, so pending timers are counted after it has run.
      const pending = async (): Promise<number> => {
        await vi.advanceTimersByTimeAsync(0);
        return vi.getTimerCount();
      };
      await fireEvent.input(ta, { target: { value: 'ana bahibbak' } });
      expect(await pending()).toBe(1);
      await fireEvent.click(send);
      expect(await pending()).toBe(0);
      await vi.waitFor(async () => expect(await draftText()).toBe(''));
      await vi.advanceTimersByTimeAsync(250);
    } finally {
      vi.useRealTimers();
    }
    expect(await draftText()).toBe('');

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('clamps an over-limit send to the handoff cap and says so', async () => {
    onTab('https://example.com/');
    const realSidePanel = chrome.sidePanel;
    const sidePanelOpen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: sidePanelOpen, setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole, findByText, container } = render(Popup);
    await mounted();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'x'.repeat(MAX_SELECTION_CHARS + 100) } });
    await fireEvent.click(await findByRole('button', { name: 'Translate' }));
    await vi.waitFor(() => expect(sidePanelOpen).toHaveBeenCalled());
    await flushAsync();

    expect(
      await findByText(`Your text is long. Ega sent the first ${MAX_SELECTION_CHARS} characters.`),
    ).toBeTruthy();
    const entries = await handoffEntries<{ sourceText: string }>();
    expect(entries[0]?.sourceText.length).toBe(MAX_SELECTION_CHARS);
    expect(closeSpy).not.toHaveBeenCalled();

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('clamps an over-limit clipboard to the handoff cap and says so', async () => {
    onTab('https://example.com/');
    const readText = navigator.clipboard.readText as unknown as Mock;
    readText.mockResolvedValueOnce('y'.repeat(MAX_SELECTION_CHARS + 500));
    const realSidePanel = chrome.sidePanel;
    const sidePanelOpen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: sidePanelOpen, setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole, findByText } = render(Popup);
    await fireEvent.click(await findByRole('button', { name: 'Translate clipboard' }));
    await vi.waitFor(() => expect(sidePanelOpen).toHaveBeenCalled());
    await flushAsync();

    expect(await findByText(new RegExp(`first ${MAX_SELECTION_CHARS} characters`))).toBeTruthy();
    const entries = await handoffEntries<{ sourceText: string }>();
    expect(entries[0]?.sourceText.length).toBe(MAX_SELECTION_CHARS);
    expect(closeSpy).not.toHaveBeenCalled();

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });

  it('Translate is aria-disabled while the box is whitespace-only, and sends nothing', async () => {
    const open = chrome.sidePanel.open as unknown as Mock;
    const { container, findByRole } = render(Popup);
    await mounted();
    const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: '   \n  ' } });
    const send = await findByRole('button', { name: 'Translate' });
    expect(send.getAttribute('aria-disabled')).toBe('true');
    expect(send.hasAttribute('disabled')).toBe(false);
    await fireEvent.click(send);
    await flushAsync();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('Popup prefill from the page selection', () => {
  it('fills the box with the page selection and focuses it', async () => {
    onTab('https://example.com/', (msg) =>
      msg.kind === 'ega:get-selection' ? { text: 'yalla habibi' } : { ok: true },
    );
    const { findByDisplayValue } = render(Popup);
    const ta = (await findByDisplayValue('yalla habibi')) as HTMLTextAreaElement;
    expect(ta.dataset['egaFreeformTextarea']).toBeDefined();
    await vi.waitFor(() => expect(document.activeElement).toBe(ta));
  });
});

describe('Popup source<->target swap', () => {
  it('clicking swap exchanges the bound source and target values', async () => {
    const { container, findByLabelText } = render(Popup);
    await mounted();
    const selects = container.querySelectorAll(
      '[data-ega-lang-pair] select',
    ) as NodeListOf<HTMLSelectElement>;
    const [fromSelect, toSelect] = [selects[0], selects[1]] as [
      HTMLSelectElement,
      HTMLSelectElement,
    ];
    await fireEvent.change(fromSelect, { target: { value: 'es' } });
    await tick();
    await fireEvent.change(toSelect, { target: { value: 'fr' } });
    await tick();
    const swap = (await findByLabelText('Swap languages')) as HTMLButtonElement;
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

    const { container, findByText } = render(Popup);
    await mounted();
    const selects = container.querySelectorAll(
      '[data-ega-lang-pair] select',
    ) as NodeListOf<HTMLSelectElement>;
    const toSelect = selects[1] as HTMLSelectElement;
    const before = toSelect.value;

    await fireEvent.change(toSelect, { target: { value: 'fr' } });

    expect(await findByText(/Storage is full|not saved/i)).toBeTruthy();
    await waitFor(() => expect(toSelect.value).toBe(before));
  });
});

describe('Popup — settings listener cleanup', () => {
  it('removes the onSettingsChanged listener when the popup unmounts', async () => {
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
    await findByRole('button', { name: 'Translate page' });
    await mounted();
    await vi.waitFor(() =>
      expect(added.filter((fn) => onChanged.hasListener(fn)).length).toBeGreaterThanOrEqual(1),
    );

    unmount();
    expect(added.filter((fn) => onChanged.hasListener(fn)).length).toBe(0);

    onChanged.addListener = origAdd;
  });
});

describe('Popup — page actions', () => {
  it.each([
    ['Translate page', 'page:translateAll'],
    ['Choose areas', 'page:chooseAreas'],
    ['Pick element', 'picker:enter'],
  ])('%s sends %s to the active tab and closes', async (name, kind) => {
    const { sent } = onTab('https://example.com/');
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole } = render(Popup);
    await mounted();
    await fireEvent.click(await findByRole('button', { name }));

    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith(42, { kind }));
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled());
    closeSpy.mockRestore();
  });

  it('any failure other than a missing content script keeps a plain message', async () => {
    onTab('https://example.com/', (msg) => {
      if (msg.kind === 'page:translateAll') throw new Error('Something else broke');
      return { ok: true };
    });
    const { findByRole, findByText } = render(Popup);
    await mounted();
    await fireEvent.click(await findByRole('button', { name: 'Translate page' }));
    expect(await findByText("Ega couldn't start page translation.")).toBeTruthy();
  });

  it('a content script lost after the popup opened is announced: the line lands in a live region that was already there', async () => {
    onTab('https://example.com/', (msg) => {
      if (msg.kind === 'page:translateAll') {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      }
      return { text: '' };
    });
    const { container, findByRole, findByText } = render(Popup);
    await mounted();
    await findByRole('switch', { name: 'Ega on example.com' });
    const region = container.querySelector('[data-ega-popup-site] [role="status"]');
    expect(region).not.toBeNull();
    expect(region?.textContent.trim()).toBe('');
    await fireEvent.click(await findByRole('button', { name: 'Translate page' }));
    expect(await findByText('Reload this page to use Ega here.')).toBeTruthy();
    expect(region?.isConnected).toBe(true);
    expect(region?.textContent).toContain('Reload this page to use Ega here.');
    // The action follows the sentence after a space, on the same line when it fits.
    expect(region?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Reload this page to use Ega here. Reload page',
    );
  });

  it('a content script lost after the popup opened turns into the reload status line', async () => {
    onTab('https://example.com/', (msg) => {
      if (msg.kind === 'page:translateAll') {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      }
      return { ok: true };
    });
    const { findByRole, findByText } = render(Popup);
    await mounted();
    await fireEvent.click(await findByRole('button', { name: 'Translate page' }));
    expect(await findByText('Reload this page to use Ega here.')).toBeTruthy();
  });
});

describe('Popup composer draft — saved from the input event', () => {
  it('text typed before the draft read finishes is still saved', async () => {
    const { container } = render(Popup);
    const ta = await vi.waitFor(() => {
      const el = container.querySelector('[data-ega-freeform-textarea]');
      if (!el) throw new Error('no box yet');
      return el as HTMLTextAreaElement;
    });
    await fireEvent.input(ta, { target: { value: 'typed early' } });
    await vi.waitFor(async () => {
      const stored = (await chrome.storage.session.get('ega.popupDraft')) as Record<
        string,
        { text?: string; expanded?: boolean } | undefined
      >;
      expect(stored['ega.popupDraft']?.text).toBe('typed early');
    });
  });

  it('a stored draft wins over the page selection', async () => {
    await chrome.storage.session.set({ 'ega.popupDraft': { text: 'my draft', expanded: true } });
    onTab('https://example.com/', (msg) =>
      msg.kind === 'ega:get-selection' ? { text: 'page text' } : { ok: true },
    );
    const { findByDisplayValue } = render(Popup);
    expect(await findByDisplayValue('my draft')).toBeTruthy();
  });
});

describe('Popup handoff tone', () => {
  it.each([
    ['freeform send', 'freeform'],
    ['clipboard', 'clipboard'],
  ])('%s hands off the default tone', async (_, path) => {
    await chrome.storage.local.set({
      'ega.settings': { defaultTone: 'formal', anthropicApiKey: 'k' },
    });
    await chrome.storage.session.remove('ega.pendingPopupHandoff');
    onTab('https://example.com/');
    const realSidePanel = chrome.sidePanel;
    Object.defineProperty(chrome, 'sidePanel', {
      configurable: true,
      value: { open: vi.fn().mockResolvedValue(undefined), setPanelBehavior: vi.fn() },
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    const { findByRole, container } = render(Popup);
    await findByRole('button', { name: 'Translate page' });
    await mounted();
    if (path === 'freeform') {
      const ta = container.querySelector('[data-ega-freeform-textarea]') as HTMLTextAreaElement;
      await fireEvent.input(ta, { target: { value: 'ahlan' } });
      await fireEvent.click(await findByRole('button', { name: 'Translate' }));
    } else {
      (navigator.clipboard.readText as unknown as Mock).mockResolvedValueOnce('ahlan');
      await fireEvent.click(await findByRole('button', { name: 'Translate clipboard' }));
    }

    const entries = await vi.waitFor(async () => {
      const found = await handoffEntries<{ tone: string }>();
      expect(found).toHaveLength(1);
      return found;
    });
    expect(entries.map((e) => e.tone)).toEqual(['formal']);

    closeSpy.mockRestore();
    Object.defineProperty(chrome, 'sidePanel', { configurable: true, value: realSidePanel });
  });
});

describe('Popup — where focus starts', () => {
  it('starts on the site switch when the site is off, not on the blocked main action', async () => {
    await chrome.storage.local.set({
      'ega.settings': {
        anthropicApiKey: 'k',
        sitePrefs: { 'https://example.com': { disabled: true } },
      },
    });
    (chrome.tabs.query as unknown as Mock).mockResolvedValue([
      { id: 42, url: 'https://example.com/' },
    ]);
    const { findByRole } = render(Popup);
    const sw = await findByRole('switch', { name: 'Ega on example.com' });
    await vi.waitFor(() => expect(document.activeElement).toBe(sw));
  });
});

describe('Popup — focus on a page that needs a reload', () => {
  it('starts on Reload page, the action that unblocks the page', async () => {
    (chrome.tabs.query as unknown as Mock).mockResolvedValue([
      { id: 42, url: 'https://example.com/' },
    ]);
    (chrome.tabs.sendMessage as unknown as Mock).mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );
    const { findByRole } = render(Popup);
    const reload = await findByRole('button', { name: 'Reload page' });
    await vi.waitFor(() => expect(document.activeElement).toBe(reload));
  });
});

describe('Popup — where focus starts on a page Ega cannot run on', () => {
  it('starts in the text box, the one thing that still works there', async () => {
    // The New Tab page: no "tabs" permission, so Chrome leaves out the url.
    (chrome.tabs.query as unknown as Mock).mockResolvedValue([{ id: 42 }]);
    const { findByText, getByLabelText } = render(Popup);
    expect(await findByText("Ega can't run on this page.")).toBeTruthy();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(getByLabelText('Translate in the side panel')),
    );
  });
});

describe('Popup — the body waits for the backend check too', () => {
  /** Holds the chip's backend probe until the test answers it, the way a stopped service worker does. */
  function holdProbe(answerWith: (resolve: (r: unknown) => void) => void): () => void {
    const send = chrome.runtime.sendMessage as unknown as Mock;
    const fallback = send.getMockImplementation();
    send.mockImplementation((msg: { kind: string }) =>
      msg.kind === 'backend:probe-all'
        ? new Promise((r) => answerWith(r))
        : (fallback?.(msg) as unknown),
    );
    return () => {
      if (fallback) send.mockImplementation(fallback);
    };
  }

  it('stays hidden while the chip is still checking, so the setup row never pushes it down', async () => {
    await chrome.storage.local.remove('ega.settings');
    onTab('https://example.com/');
    let answer: ((r: unknown) => void) | undefined;
    const restore = holdProbe((r) => (answer = r));
    try {
      const { container } = render(Popup);
      await mounted();
      await vi.waitFor(() => expect(answer).toBeDefined());
      await flushAsync();
      await tick();
      const body = container.querySelector('.popup-body');
      expect(body?.classList.contains('pending')).toBe(true);
      answer?.({ available: {}, active: null });
      await vi.waitFor(() => expect(body?.classList.contains('pending')).toBe(false));
      // The setup row is there from the first frame the body shows.
      expect(container.querySelector('[data-ega-popup-no-backend]')).not.toBeNull();
    } finally {
      restore();
    }
  });

  it('shows anyway when the check takes longer than half a second', async () => {
    await chrome.storage.local.remove('ega.settings');
    onTab('https://example.com/');
    const restore = holdProbe(() => {});
    try {
      const { container } = render(Popup);
      await mounted();
      await vi.waitFor(() => expect(container.querySelector('.popup-body.pending')).toBeNull(), {
        timeout: 2000,
      });
    } finally {
      restore();
    }
  });
});

describe('Popup — a page action pressed while the page loads', () => {
  const NONE = 'Could not establish connection. Receiving end does not exist.';

  /** A page that loads when the test says so; `delivered` lists the actions the content script got. */
  function loadingPage(): { delivered: string[]; load: () => void } {
    let loaded = false;
    const delivered: string[] = [];
    (chrome.tabs.query as unknown as Mock).mockResolvedValue([
      { id: 42, url: 'https://example.com/', status: 'complete' },
    ]);
    (chrome.tabs.sendMessage as unknown as Mock).mockImplementation(
      async (_id: number, msg: { kind: string }) => {
        if (msg.kind === 'ega:get-selection') return { text: '' };
        if (!loaded) throw new Error(NONE);
        delivered.push(msg.kind);
        return { ok: true };
      },
    );
    (chrome.tabs.get as unknown as Mock).mockImplementation(async () => ({
      id: 42,
      status: loaded ? 'complete' : 'loading',
    }));
    return { delivered, load: () => (loaded = true) };
  }

  it('says it is waiting while the page loads, and runs the press once it has loaded', async () => {
    const page = loadingPage();
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    try {
      const { findByRole, findByText } = render(Popup);
      await mounted();
      await fireEvent.click(await findByRole('button', { name: 'Translate page' }));
      expect(await findByText('Waiting for the page to load…')).toBeTruthy();
      page.load();
      await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 3000 });
      // Only the latest of several presses runs: tab-actions.test.ts drives that on fake timers.
      expect(page.delivered).toEqual(['page:translateAll']);
    } finally {
      closeSpy.mockRestore();
    }
  });
});
