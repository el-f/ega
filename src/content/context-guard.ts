// After the extension reloads, already-injected content scripts keep running but every sendMessage throws; only a page reload fixes it.

/** True while the content script can still reach the extension. */
export function isExtensionContextValid(): boolean {
  try {
    // @types/chrome says both are non-nullable; both become undefined once the context dies.
    const runtime = chrome.runtime as typeof chrome.runtime | undefined;
    return runtime?.id != null;
  } catch {
    // Touching chrome.runtime after invalidation can itself throw.
    return false;
  }
}

/** True when a thrown error is the MV3 context-invalidation signal. */
export function isContextInvalidatedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return msg.toLowerCase().includes('context invalidated');
}

/** Message shown when the context is gone — tells the user the one fix. */
export const CONTEXT_INVALIDATED_MESSAGE = 'Ega was updated. Reload the page to keep using it.';

/** Message shown when a request never reached the worker for any other reason. */
export const SEND_FAILED_MESSAGE =
  'Ega could not send this request. Reload the page and try again.';
