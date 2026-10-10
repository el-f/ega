import { STORAGE_KEYS } from '@/shared/constants';
import { onStoredChange } from '@/shared/stored-changes';
import { sendMsg } from '@/shared/messages';
import type { CustomLanguage } from '@/shared/types';
import type { CustomTask } from '@/shared/settings-schema';

// Read through the worker, like settings-cache, so no page parses the storage reader.
async function getCustomLanguages(): Promise<CustomLanguage[]> {
  const list = await sendMsg({ kind: 'content:read-languages' });
  if (!Array.isArray(list)) throw new Error('the worker sent no custom languages');
  return list;
}

async function getCustomTasks(): Promise<CustomTask[]> {
  const list = await sendMsg({ kind: 'content:read-tasks' });
  if (!Array.isArray(list)) throw new Error('the worker sent no custom tasks');
  return list;
}

/** `selectionchange` fires many times per drag, so the rarely-changing customLanguages list is cached in memory. */
let cache: CustomLanguage[] | null = null;
// An in-flight read captures this before its await; a changed token at resolve time means the result is stale.
let cacheToken = 0;

export async function ensureCustomLanguages(): Promise<CustomLanguage[]> {
  if (cache) return cache;
  const myToken = cacheToken;
  const list = await getCustomLanguages();
  if (myToken !== cacheToken) {
    // Invalidator fired during the await — drop the stale result and read again.
    return ensureCustomLanguages();
  }
  cache = list;
  return cache;
}

/** Sync view for render paths. Empty until the first async read lands, which every
 *  translate does before it opens a surface. */
export function cachedCustomLanguages(): readonly CustomLanguage[] {
  return cache ?? [];
}

/** Test hook — reset for a fresh read path in unit tests. */
export function resetCustomLanguagesCache(): void {
  cache = null;
  cacheToken++;
  taskCache = null;
  taskToken++;
}

let taskCache: CustomTask[] | null = null;
let taskToken = 0;
const taskListeners = new Set<(tasks: readonly CustomTask[]) => void>();

export async function ensureCustomTasks(): Promise<CustomTask[]> {
  if (taskCache) return taskCache;
  const myToken = taskToken;
  const list = await getCustomTasks();
  if (myToken !== taskToken) return ensureCustomTasks();
  taskCache = list;
  for (const listener of taskListeners) listener(list);
  return taskCache;
}

/** Keep an open tooltip's task names and capabilities current after edits in Settings. */
export function onCustomTasksUpdate(listener: (tasks: readonly CustomTask[]) => void): () => void {
  taskListeners.add(listener);
  void ensureCustomTasks().catch(() => {});
  return () => {
    taskListeners.delete(listener);
  };
}

/** Sync view for render paths; empty until the first read lands. */
export function cachedCustomTasks(): readonly CustomTask[] {
  return taskCache ?? [];
}

/** Install the listener that invalidates both caches when their keys change. */
export function installCustomLanguagesInvalidator(): void {
  onStoredChange((changes) => {
    if (STORAGE_KEYS.customLanguages in changes) {
      cache = null;
      cacheToken++;
    }
    if (STORAGE_KEYS.customTasks in changes) {
      taskCache = null;
      taskToken++;
      if (taskListeners.size > 0) void ensureCustomTasks().catch(() => {});
    }
  });
}
