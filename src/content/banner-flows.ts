import { showBanner } from './banner';
import { patchSettings } from '@/shared/settings-bus';
import { pending } from './request-state';
import { isExtensionContextValid } from './context-guard';
import type { Settings } from '@/shared/types';

let smartBannerShownThisSession = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_POLL_MS = 500;
const MAX_DEFER_MS = 60_000;

/** Teardown hook: the idle poll must not outlive the content script's UI and remount a dead host. */
export function cancelSmartBannerPoll(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

/** Dismiss persists the flag, so later suppressions stay silent. */
export function maybeShowSmartBannerOnce(s: Settings): void {
  if (s.bubbleMode !== 'smart') return;
  if (s.smartBubbleBannerShown) return;
  if (smartBannerShownThisSession) return;
  smartBannerShownThisSession = true;
  const persist = (): void => {
    // Through the SW: a content-script write cannot join the extension-origin settings lock.
    void patchSettings({ smartBubbleBannerShown: true });
  };
  const show = (): void => {
    showBanner({
      message:
        'The translate button appears only on text Ega can translate. Change this in Settings → Selection & picker.',
      onDismiss: persist,
    });
  };
  // A translate is often streaming when this fires — wait for it to settle instead of competing with it.
  let deferred = 0;
  const showWhenIdle = (): void => {
    pollTimer = null;
    if (!isExtensionContextValid()) return;
    if (pending.size === 0 || deferred >= MAX_DEFER_MS) {
      show();
      return;
    }
    deferred += IDLE_POLL_MS;
    pollTimer = setTimeout(showWhenIdle, IDLE_POLL_MS);
  };
  showWhenIdle();
}
