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

/** Sends one page action to the content tab and closes the popup. False when nothing was dispatched. */
export async function sendToPage(msg: Msg, opts: TargetCallbacks): Promise<boolean> {
  let tabId: number | undefined;
  try {
    const tab = await resolveContentTab();
    if (!tab?.id) {
      opts.onNoTarget?.();
      return false;
    }
    tabId = tab.id;
    await chrome.tabs.sendMessage(tab.id, msg);
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
    const target = await resolveContentTab();
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
