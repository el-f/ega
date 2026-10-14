import { deriveOrigin, GENERAL_ORIGIN } from './conversation-store';

const FOLLOW_DEBOUNCE_MS = 150;

/** The window hosting this panel; undefined falls back to whole-browser behavior. */
export async function getPanelWindowId(): Promise<number | undefined> {
  try {
    return (await chrome.windows.getCurrent()).id;
  } catch {
    return undefined;
  }
}

/** Active tab origin in windowId (focused window if unknown); an unscoped query would answer for whichever window is focused now. */
export async function getActiveOrigin(windowId?: number): Promise<string> {
  try {
    const tabs = await chrome.tabs.query(
      windowId !== undefined
        ? { active: true, windowId }
        : { active: true, lastFocusedWindow: true },
    );
    return deriveOrigin(tabs[0]?.url);
  } catch {
    return GENERAL_ORIGIN;
  }
}

/** Calls onOrigin (debounced 150ms) when the active tab changes or navigates; returns an unsubscribe. */
export function startOriginFollower(onOrigin: (origin: string) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ownWindowId: number | undefined;
  void getPanelWindowId().then((id) => {
    ownWindowId = id;
  });
  // Fail open on either undefined: an unknown window must not stop the panel following its own tabs.
  const inOwnWindow = (windowId: number | undefined): boolean =>
    ownWindowId === undefined || windowId === undefined || windowId === ownWindowId;

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void getActiveOrigin(ownWindowId).then(onOrigin);
    }, FOLLOW_DEBOUNCE_MS);
  };

  const onActivated = (info: chrome.tabs.OnActivatedInfo): void => {
    if (inOwnWindow(info.windowId)) schedule();
  };

  const onUpdated = (
    _tabId: number,
    changeInfo: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab,
  ): void => {
    if (changeInfo.url !== undefined && tab.active && inOwnWindow(tab.windowId)) schedule();
  };

  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);

  return () => {
    if (timer !== null) clearTimeout(timer);
    chrome.tabs.onActivated.removeListener(onActivated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
  };
}
