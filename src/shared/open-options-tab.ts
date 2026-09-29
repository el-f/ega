import type { SettingsTab } from '@/shared/settings-tabs';
import { debugCatch } from '@/shared/logger';

const PENDING_TAB_KEY = 'ega.pendingOptionsTab';

export function openOptionsTab(tab?: SettingsTab): void {
  if (tab) {
    // A failed park still opens the page; the user lands on the default tab instead of nowhere.
    void chrome.storage.local
      .set({ [PENDING_TAB_KEY]: tab })
      .catch((e: unknown) => debugCatch(e, 'openOptionsTab.pendingTab'));
  }
  // Mocked as a plain vi.fn() in tests, so the return value is not always a promise.
  void Promise.resolve(chrome.runtime.openOptionsPage()).catch((e: unknown) => {
    debugCatch(e, 'openOptionsTab');
    void reportOpenFailed();
  });
}

async function reportOpenFailed(): Promise<void> {
  try {
    // Lazy so the service worker's module graph stays free of svelte-sonner.
    const { toastStore } = await import('./components/toastStore');
    toastStore.push({
      message: 'Could not open Settings. Open chrome://extensions, pick Ega, then Details.',
      variant: 'danger',
    });
  } catch (e) {
    debugCatch(e, 'openOptionsTab.notice');
  }
}

/** Fires with the parked tab while the page is already open. Returns the unsubscribe. */
export function onPendingOptionsTab(cb: (tab: string) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local' || !(PENDING_TAB_KEY in changes)) return;
    void consumePendingOptionsTab()
      .then((tab) => {
        if (tab !== null) cb(tab);
      })
      .catch((e: unknown) => debugCatch(e, 'onPendingOptionsTab'));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function consumePendingOptionsTab(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(PENDING_TAB_KEY, (v: Record<string, unknown>) => {
      const raw = v[PENDING_TAB_KEY];
      if (typeof raw !== 'string') {
        resolve(null);
        return;
      }
      chrome.storage.local.remove(PENDING_TAB_KEY, () => resolve(raw));
    });
  });
}
