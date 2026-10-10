import { onMount } from 'svelte';
import { getCustomTasks } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { debugCatch } from '@/shared/logger';
import type { CustomTask } from '@/shared/settings-schema';

/** The stored custom tasks, kept current while the calling component is mounted. Call it during component init. */
export function liveCustomTasks(): {
  readonly rows: readonly CustomTask[];
  readonly loaded: boolean;
  reload: () => Promise<void>;
} {
  let rows = $state.raw<CustomTask[]>([]);
  let loaded = $state(false);
  let generation = 0;
  /** Settles once the rows are current, so a caller can move focus to a row. */
  async function reload(): Promise<void> {
    const mine = ++generation;
    try {
      const next = await getCustomTasks();
      if (mine !== generation) return;
      rows = next;
      loaded = true;
    } catch (e) {
      debugCatch(e, 'options.liveCustomTasks');
    }
  }
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === 'local' && STORAGE_KEYS.customTasks in changes) void reload();
  };
  onMount(() => {
    void reload();
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  });
  return {
    get rows() {
      return rows;
    },
    get loaded() {
      return loaded;
    },
    reload,
  };
}
