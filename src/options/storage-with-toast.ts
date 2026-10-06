import { updateSettings } from '@/shared/storage';
import { QUOTA_MESSAGE } from '@/shared/constants';
import { toastStore } from '@/shared/components/toastStore';
import type { Settings } from '@/shared/types';

/** Tells the user a settings write did not land. */
export function reportSaveFailure(e: unknown): void {
  const detail = e instanceof Error ? e.message : String(e);
  toastStore.push({
    message: /QUOTA/i.test(detail) ? QUOTA_MESSAGE : `Change not saved: ${detail}`,
    variant: 'warning',
  });
}

/** Runs a settings write and tells the user when it did not land. Returns null on failure. */
export async function saveVia<T = Settings>(write: () => Promise<T>): Promise<T | null> {
  try {
    return await write();
  } catch (e) {
    reportSaveFailure(e);
    return null;
  }
}

/** Writes settings and tells the user when the write did not land. Returns null on failure. */
export function saveSettings(patch: Partial<Settings>): Promise<Settings | null> {
  return saveVia(() => updateSettings(patch));
}
