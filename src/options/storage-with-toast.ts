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

/** Tells the user a settings write did not land, with Try again when it can help. */
export function reportSaveFailure(e: unknown, retry?: () => void): void {
  const { message, retryable } = saveFailureReason(e);
  toastStore.push({
    message,
    variant: 'danger',
    ...(retry && retryable ? { action: { label: 'Try again', onClick: retry } } : {}),
  });
}

/** Runs a settings write and tells the user when it did not land. Returns null on failure. */
export async function saveVia<T = Settings>(write: () => Promise<T>): Promise<T | null> {
  try {
    return await write();
  } catch (e) {
    reportSaveFailure(e, () => void saveVia(write));
    return null;
  }
}

/** Writes settings and tells the user when the write did not land. Returns null on failure. */
export function saveSettings(patch: Partial<Settings>): Promise<Settings | null> {
  return saveVia(() => updateSettings(patch));
}
