import { updateSettings } from '@/shared/storage';
import { QUOTA_MESSAGE } from '@/shared/constants';
import { toastStore } from '@/shared/components/toastStore';
import type { Settings } from '@/shared/types';

/** The plain reason a settings write did not land; null when trying again cannot help. */
export function saveFailureReason(e: unknown): { message: string; retryable: boolean } {
  const detail = e instanceof Error ? e.message : String(e);
  if (/QUOTA/i.test(detail)) return { message: QUOTA_MESSAGE, retryable: false };
  return { message: 'Not saved. Chrome did not take the change.', retryable: true };
}

/**
 * Tells the user a settings write did not land, with Try again when it can help. Toasts without Undo collapse by
 * key (X14), and every failure shares one message, so a write with its own Try again passes its own key.
 */
export function reportSaveFailure(e: unknown, retry?: () => void, key?: string): void {
  const { message, retryable } = saveFailureReason(e);
  toastStore.push({
    message,
    variant: 'danger',
    ...(key === undefined ? {} : { key }),
    ...(retry && retryable ? { action: { label: 'Try again', onClick: retry } } : {}),
  });
}

let writes = 0;

/**
 * Runs a settings write and tells the user when it did not land. Returns null on failure. Each write keeps one key
 * across its retries: a retry first closes that write's stale error, and another write's error stays on screen.
 */
export async function saveVia<T = Settings>(
  write: () => Promise<T>,
  key = `save:${++writes}`,
): Promise<T | null> {
  toastStore.close(key);
  try {
    return await write();
  } catch (e) {
    reportSaveFailure(e, () => void saveVia(write, key), key);
    return null;
  }
}

/** Writes settings and tells the user when the write did not land. Returns null on failure. */
export function saveSettings(patch: Partial<Settings>): Promise<Settings | null> {
  // One key per field set: a newer write of the same fields replaces the older failure, which it supersedes.
  return saveVia(() => updateSettings(patch), `save:${Object.keys(patch).sort().join(',')}`);
}
