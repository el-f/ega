import { describe, expect, it, beforeEach } from 'vitest';
import { clearPopupDraft, readPopupDraft, writePopupDraft } from '@/shared/pending-popup-draft';

const STORAGE_KEY = 'ega.popupDraft';

describe('pending-popup-draft', () => {
  beforeEach(async () => {
    await chrome.storage.session.remove(STORAGE_KEY);
  });

  it('read returns null when nothing saved', async () => {
    const out = await readPopupDraft();
    expect(out).toBeNull();
  });

  it('write then read returns the draft', async () => {
    await writePopupDraft({ text: 'half thought', expanded: true });
    const out = await readPopupDraft();
    expect(out).toEqual({ text: 'half thought', expanded: true });
  });

  it('clear removes the slot', async () => {
    await writePopupDraft({ text: 'tmp', expanded: false });
    await clearPopupDraft();
    const out = await readPopupDraft();
    expect(out).toBeNull();
  });

  it('rejects malformed payload and returns null', async () => {
    await chrome.storage.session.set({ [STORAGE_KEY]: { text: 42, expanded: 'yes' } });
    const out = await readPopupDraft();
    expect(out).toBeNull();
  });

  it('preserves the expanded flag round-trip', async () => {
    await writePopupDraft({ text: '', expanded: true });
    const out = await readPopupDraft();
    expect(out?.expanded).toBe(true);
    expect(out?.text).toBe('');
  });
});
