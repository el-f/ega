import { debugCatch } from '@/shared/logger';
import type { Msg } from '@/shared/messages';
import { writePendingPopupHandoff, type PendingPopupHandoff } from '@/shared/pending-popup-handoff';

/** The content tab behind the popup. `currentWindow` can be the popup's own window, so it is not tried first. */
async function resolveContentTab(): Promise<chrome.tabs.Tab | null> {
  const tryQuery = async (query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab | null> => {
    const tabs = await chrome.tabs.query(query);
    const good = tabs.find(
      (t) =>
        t.id !== undefined &&
        typeof t.url === 'string' &&
        !t.url.startsWith('chrome-extension://') &&
        !t.url.startsWith('chrome://'),
    );
    return good ?? null;
  };
  return (
    (await tryQuery({ active: true, lastFocusedWindow: true })) ??
    (await tryQuery({ active: true, currentWindow: true }))
  );
}

export interface TargetCallbacks {
  onNoTarget?: () => void;
  onError?: (err: unknown, tabId?: number) => void;
}

export interface OpenSidePanelOpts extends TargetCallbacks {
  /** Skip window.close() so a toast pushed just before stays readable. */
  keepOpen?: boolean;
}

/** The raw active tab, chrome:// pages included, so the popup can tell "restricted" from "no tab". */
export async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

/** The tab this page runs in: none for the toolbar popup, the tab itself when the popup page is opened as a tab. */
export async function ownTabId(): Promise<number | undefined> {
  return (await chrome.tabs.getCurrent())?.id;
}

/** Chrome's words when nothing in the tab listens: a page opened before Ega was installed or updated, or still loading. */
export const NO_RECEIVER = /Receiving end does not exist|Could not establish connection/i;

const LOAD_WAIT_MS = 10_000;
const LOAD_POLL_MS = 250;

/** Sends until the tab's content script answers. A loading page has none until it is idle; a loaded page that never answers fails at once. */
export async function sendWhenLoaded<T>(tabId: number, send: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + LOAD_WAIT_MS;
  let sawLoading = false;
  let graced = false;
  for (;;) {
    try {
      return await send();
    } catch (e) {
      const loading =
        NO_RECEIVER.test(String(e)) &&
        Date.now() < deadline &&
        (await chrome.tabs.get(tabId).catch(() => undefined))?.status === 'loading';
      if (loading) sawLoading = true;
      // The script lands a moment after the load ends, so a tab that was loading gets one more try.
      else if (sawLoading && !graced) graced = true;
      else throw e;
      await new Promise((r) => setTimeout(r, LOAD_POLL_MS));
    }
  }
}

/** Sends one page action to the content tab and closes the popup. False when nothing was dispatched. */
export async function sendToPage(msg: Msg, opts: TargetCallbacks): Promise<boolean> {
  let tabId: number | undefined;
  try {
    const tab = await resolveContentTab();
    if (!tab?.id) {
      opts.onNoTarget?.();
      return false;
    }
    const id = tab.id;
    tabId = id;
    await sendWhenLoaded(id, () => chrome.tabs.sendMessage(id, msg));
    window.close();
    return true;
  } catch (e) {
    debugCatch(e, `popup.tab-actions.${msg.kind}`);
    opts.onError?.(e, tabId);
    return false;
  }
}

/** Must be called straight from a click handler; `sidePanel.open()` rejects once the gesture expires. */
export async function openSidePanel(
  handoff?: PendingPopupHandoff | null,
  opts: OpenSidePanelOpts = {},
): Promise<boolean> {
  try {
    // The side panel opens beside any tab, so a page Ega cannot run on (chrome://, the New Tab page) still gets it.
    const target = (await resolveContentTab()) ?? (await activeTab());
    if (target?.id !== undefined) {
      // Write before open() — the popup unloads right after, so a later write loses the race.
      if (handoff && handoff.sourceText.trim().length > 0) {
        await writePendingPopupHandoff({ ...handoff, windowId: target.windowId });
      }
      await chrome.sidePanel.open({ tabId: target.id });
      if (!opts.keepOpen) window.close();
      return true;
    }
    opts.onNoTarget?.();
    return false;
  } catch (e) {
    debugCatch(e, 'popup.tab-actions.sidepanel');
    opts.onError?.(e);
    return false;
  }
}
