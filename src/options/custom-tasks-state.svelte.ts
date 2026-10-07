import { onMount } from 'svelte';
import { getCustomTasks } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { debugCatch } from '@/shared/logger';
import type { CustomTask } from '@/shared/settings-schema';

/** The stored custom tasks, kept current while the calling component is mounted. Call it during component init. */
export function liveCustomTasks(): { readonly rows: readonly CustomTask[]; reload: () => void } {
  let rows = $state.raw<CustomTask[]>([]);
  function reload(): void {
    void getCustomTasks()
      .then((next) => {
        rows = next;
      })
      .catch((e: unknown) => debugCatch(e, 'options.liveCustomTasks'));
  }
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === 'local' && STORAGE_KEYS.customTasks in changes) reload();
  };
  onMount(() => {
    reload();
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  });
  return {
    get rows() {
      return rows;
    },
    reload,
  };
}
