import { debugCatch } from '@/shared/logger';
import { getFreshSelection } from '@/shared/sessionSelection';
import { sendTabMsg } from '@/shared/messages';
import { resolveContentTab } from './popup-tab-actions';

function tabOrigin(tab: chrome.tabs.Tab | null): string | null {
  if (typeof tab?.url !== 'string') return null;
  try {
    return new URL(tab.url).origin;
  } catch {
    return null;
  }
}

/** Active tab's selection, or null. The caller must re-check for keystrokes at write time — more can land while this resolves. */
export async function prefillFromActiveTabSelection(
  currentSourceText: string,
): Promise<string | null> {
  // Text in the box wins, so there is nothing to ask the tab for.
  if (currentSourceText !== '') return null;
  let tab: chrome.tabs.Tab | null = null;
  try {
    tab = await resolveContentTab();
    const cached = await getFreshSelection(tabOrigin(tab));
    if (cached) return cached;
  } catch (e) {
    debugCatch(e, 'popup.controllers.popup-autofill.2');
  }
  try {
    if (!tab?.id) return null;
    const reply = await sendTabMsg(tab.id, { kind: 'ega:get-selection' });
    const text = reply?.text ?? '';
    return text || null;
  } catch {
    /* no content script on chrome:// and extension:// tabs */
    return null;
  }
}
