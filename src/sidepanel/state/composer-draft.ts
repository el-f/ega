// Chrome destroys the panel on close, so an unsent draft lives in session storage (like shared/pending-popup-draft.ts).

import { getPanelWindowId } from './active-origin';
import { isSafeRenderImageSrc } from '@/shared/image-url-guard';
import { MAX_IMAGE_BYTES } from './conversation-store';

const KEY_PREFIX = 'ega.sidepanelDraft';
const IMAGE_KEY_PREFIX = 'ega.sidepanelDraftImage';

// One panel document is one window for its whole life, so the key can be resolved once.
let keyPromise: Promise<{ text: string; image: string }> | null = null;
function draftKeys(): Promise<{ text: string; image: string }> {
  keyPromise ??= getPanelWindowId().then((id) =>
    id === undefined
      ? { text: KEY_PREFIX, image: IMAGE_KEY_PREFIX }
      : { text: `${KEY_PREFIX}:${id}`, image: `${IMAGE_KEY_PREFIX}:${id}` },
  );
  return keyPromise;
}

function decode(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const text = (raw as Record<string, unknown>)['text'];
  return typeof text === 'string' ? text : null;
}

export async function readComposerDraft(): Promise<string | null> {
  try {
    const { text: key } = await draftKeys();
    const out = await chrome.storage.session.get(key);
    return decode((out as Record<string, unknown>)[key]);
  } catch {
    return null;
  }
}

export async function writeComposerDraft(text: string): Promise<void> {
  const { text: key } = await draftKeys();
  await chrome.storage.session.set({ [key]: { text } });
}

export async function clearComposerDraft(): Promise<void> {
  const { text: key } = await draftKeys();
  await chrome.storage.session.remove(key);
}

/** Any same-extension context can write session storage, and this value goes straight into an `<img src>`. */
export async function readComposerDraftImage(): Promise<string | null> {
  try {
    const { image: key } = await draftKeys();
    const raw = (await chrome.storage.session.get(key))[key] as unknown;
    if (raw === null || typeof raw !== 'object') return null;
    const src = (raw as Record<string, unknown>)['src'];
    return typeof src === 'string' && isSafeRenderImageSrc(src) ? src : null;
  } catch {
    return null;
  }
}

/** False when the image is past the cap the thread store would strip it at — nothing is written. */
export async function writeComposerDraftImage(src: string): Promise<boolean> {
  if (src.length > MAX_IMAGE_BYTES) {
    // Leave nothing rather than the previous image: a remount would restore the wrong one.
    await clearComposerDraftImage();
    return false;
  }
  const { image: key } = await draftKeys();
  await chrome.storage.session.set({ [key]: { src } });
  return true;
}

export async function clearComposerDraftImage(): Promise<void> {
  const { image: key } = await draftKeys();
  await chrome.storage.session.remove(key);
}

/** Rows left by windows that have since closed — session storage outlives them. */
export async function pruneOrphanDrafts(): Promise<void> {
  try {
    const stored = (await chrome.storage.session.get(null)) as Record<string, unknown>;
    const mine = Object.keys(stored).filter(
      (k) => k.startsWith(`${KEY_PREFIX}:`) || k.startsWith(`${IMAGE_KEY_PREFIX}:`),
    );
    if (mine.length === 0) return;
    const live = new Set((await chrome.windows.getAll()).map((w) => String(w.id)));
    const dead = mine.filter((k) => !live.has(k.slice(k.lastIndexOf(':') + 1)));
    if (dead.length > 0) await chrome.storage.session.remove(dead);
  } catch {
    /* A prune that fails costs storage, never data. */
  }
}
