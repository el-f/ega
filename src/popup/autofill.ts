import { sendTabMsg } from '@/shared/messages';
import { resolveContentTab } from './tab-actions';

/** Active tab's selection, or null. The caller must re-check for keystrokes at write time — more can land while this resolves. */
export async function prefillFromActiveTabSelection(
  currentSourceText: string,
): Promise<string | null> {
  // Text in the box wins, so there is nothing to ask the tab for.
  if (currentSourceText !== '') return null;
  try {
    // The page keeps a selection it dropped when the popup took focus, so it answers for both.
    const tab = await resolveContentTab();
    if (!tab?.id) return null;
    const reply = await sendTabMsg(tab.id, { kind: 'ega:get-selection' });
    const text = reply?.text ?? '';
    return text || null;
  } catch {
    /* no content script on chrome:// and extension:// tabs */
    return null;
  }
}
