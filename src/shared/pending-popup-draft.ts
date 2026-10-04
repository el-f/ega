// The popup unloads on every close, so the draft lives in session storage.

const STORAGE_KEY = 'ega.popupDraft';

export interface PopupDraft {
  readonly text: string;
  readonly expanded: boolean;
}

function decode(raw: unknown): PopupDraft | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['text'] !== 'string') return null;
  if (typeof r['expanded'] !== 'boolean') return null;
  return { text: r['text'], expanded: r['expanded'] };
}

export async function readPopupDraft(): Promise<PopupDraft | null> {
  try {
    const out = await chrome.storage.session.get(STORAGE_KEY);
    return decode((out as Record<string, unknown>)[STORAGE_KEY]);
  } catch {
    return null;
  }
}

export async function writePopupDraft(draft: PopupDraft): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: draft });
}

export async function clearPopupDraft(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}
