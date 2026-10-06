import { STORAGE_KEYS } from './constants';
import type { CustomLanguage, Settings } from './types';
import {
  CUSTOM_LANGUAGES_MAX,
  CUSTOM_TASKS_MAX,
  normaliseBackendOrder,
  parseCustomLanguageRows,
  parseCustomTaskRows,
  sanitiseStoredSettings,
} from './storage/sanitise';
import type { Rule } from './rules';
import { makeCrossContextLock } from './utils/cross-context-lock';
import { onStoredChange } from './stored-changes';
import { withConversationLock } from './conversation-lock';
import * as valibot from 'valibot';
import { customLanguageSchema, customTaskSchema, type CustomTask } from './settings-schema';
import { clampToSchema } from './settings-clamp';

async function readLocal<T>(key: string, fallback: T): Promise<T> {
  const r = await chrome.storage.local.get(key);
  return (r[key] as T) ?? fallback;
}

export async function writeLocal<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getSettings(): Promise<Settings> {
  const [raw, customs, customTasks] = await Promise.all([
    readLocal<Record<string, unknown>>(STORAGE_KEYS.settings, {}),
    readCustomLanguages(),
    readCustomTasks(),
  ]);
  return sanitiseStoredSettings(raw, customs, { customTasks });
}

// A content script's navigator.locks belongs to the page origin and cannot join this one, so content writes go through the SW.
export const withSettingsLock = makeCrossContextLock('ega:settings');

export function mergeSettingsPatch(cur: Settings, patch: Partial<Settings>): Settings {
  const merged: Settings = {
    ...cur,
    ...patch,
    model: { ...cur.model, ...patch.model },
    advanced: { ...cur.advanced, ...patch.advanced },
    // Map fields deep-merge, so replacing one wholesale needs the full map passed in.
    sitePrefs: { ...cur.sitePrefs, ...patch.sitePrefs },
    varietyOverrides: { ...cur.varietyOverrides, ...patch.varietyOverrides },
  };
  const next: Settings = { ...merged, backendOrder: normaliseBackendOrder(merged.backendOrder) };
  const disabled = new Set<string>(merged.disabledBackends);
  // Only a patch that touches the chain can be refused for it; a theme toggle must still save on a row an old import left all-disabled.
  const touchesChain = 'backendOrder' in patch || 'disabledBackends' in patch;
  if (touchesChain && next.backendOrder.every((id) => disabled.has(id))) {
    throw new Error('At least one backend must stay enabled');
  }
  return next;
}

export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return withSettingsLock(async () => {
    const next = mergeSettingsPatch(await getSettings(), patch);
    await writeLocal(STORAGE_KEYS.settings, next);
    return next;
  });
}

// Read-modify-write INSIDE the lock: reading first at the call site lets a
// concurrent rule write land between the snapshot and the update.
export type RulesTransform = (cur: readonly Rule[]) => Rule[];

export function replaceRules(transform: RulesTransform): Promise<Settings> {
  return withSettingsLock(async () => {
    const cur = await getSettings();
    const nextRules = transform(cur.advanced.rules);
    const next: Settings = {
      ...cur,
      advanced: { ...cur.advanced, rules: nextRules },
    };
    await writeLocal(STORAGE_KEYS.settings, next);
    return next;
  });
}

// These bypass the deep merge so a caller can DELETE a key: the merge would
// resurrect anything absent from the passed map, undoing the user's removal.
export function replaceSettings(apply: (cur: Settings) => Settings): Promise<Settings> {
  return replaceSettingsField(apply);
}

function replaceSettingsField(apply: (cur: Settings) => Settings): Promise<Settings> {
  return withSettingsLock(async () => {
    const next = apply(await getSettings());
    await writeLocal(STORAGE_KEYS.settings, next);
    return next;
  });
}

/** A value replaces the map; a transform reads the current one under the lock, so a write that landed since the caller's snapshot is not lost. */
export type NextOrTransform<T> = T | ((cur: T) => T);

function resolveNext<T>(next: NextOrTransform<T>, cur: T): T {
  return typeof next === 'function' ? (next as (c: T) => T)(cur) : next;
}

export function replaceSitePrefs(next: NextOrTransform<Settings['sitePrefs']>): Promise<Settings> {
  return replaceSettingsField((cur) => ({ ...cur, sitePrefs: resolveNext(next, cur.sitePrefs) }));
}

export function replaceVarietyOverrides(
  next: NextOrTransform<Settings['varietyOverrides']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    varietyOverrides: resolveNext(next, cur.varietyOverrides),
  }));
}

/** Task edits are written whole, never through the deep merge, so a field the user reset cannot come back. */
export function replaceTaskOverrides(
  next: NextOrTransform<Settings['taskOverrides']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    taskOverrides: resolveNext(next, cur.taskOverrides),
  }));
}

export function replacePerPresetTemplates(
  next: NextOrTransform<Settings['advanced']['perPresetTemplates']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    advanced: {
      ...cur.advanced,
      perPresetTemplates: resolveNext(next, cur.advanced.perPresetTemplates),
    },
  }));
}

/** Null when the stored value is not a list: the rows are unknown, so a settings read must not drop references to them. */
async function readRows<T>(
  key: string,
  parse: (raw: readonly unknown[]) => T[],
): Promise<T[] | null> {
  const raw = await readLocal<unknown>(key, []);
  if (Array.isArray(raw)) return parse(raw);
  console.warn(`[ega.storage] ${key} is not an array — reading as empty`);
  return null;
}

/** Null when the stored value is not a list; getCustomLanguages reads that as empty. */
export const readCustomLanguages = (): Promise<CustomLanguage[] | null> =>
  readRows(STORAGE_KEYS.customLanguages, (raw) => parseCustomLanguageRows(raw, 'keep'));

const readCustomTasks = (): Promise<CustomTask[] | null> =>
  readRows(STORAGE_KEYS.customTasks, (raw) => parseCustomTaskRows(raw, 'keep'));

// Never throws on a bad row: getSettings awaits this, so a rejection leaves every surface with no settings.
export async function getCustomLanguages(): Promise<CustomLanguage[]> {
  return (await readCustomLanguages()) ?? [];
}

// Never throws on a bad row, like getCustomLanguages: getSettings awaits this.
export async function getCustomTasks(): Promise<CustomTask[]> {
  return (await readCustomTasks()) ?? [];
}

export const withCustomsLock = makeCrossContextLock('ega:custom-languages');

// Clamp to the schema here, or the reader has to drop the whole entry later.
function clampLanguageRow(lang: CustomLanguage): CustomLanguage | null {
  const clamped = valibot.safeParse(
    customLanguageSchema,
    clampToSchema(customLanguageSchema, lang),
  );
  return clamped.success ? (clamped.output as CustomLanguage) : null;
}

// 'invalid-language', 'cap-reached' and 'language-gone' are the messages the Languages tab turns into its own copy.
export function upsertCustomLanguage(lang: CustomLanguage): Promise<void> {
  const entry = clampLanguageRow(lang);
  if (!entry) return Promise.reject(new Error('invalid-language'));
  return withCustomsLock(async () => {
    const list = await getCustomLanguages();
    const idx = list.findIndex((l) => l.id === entry.id);
    if (idx === -1 && list.length >= CUSTOM_LANGUAGES_MAX) throw new Error('cap-reached');
    if (idx === -1) list.push(entry);
    else list[idx] = entry;
    await writeLocal(STORAGE_KEYS.customLanguages, list);
  });
}

/** Rewrites an existing row under the lock; rejects 'language-gone' when another window deleted it. */
export function updateCustomLanguageRow(
  id: string,
  apply: (cur: CustomLanguage) => CustomLanguage,
): Promise<void> {
  return withCustomsLock(async () => {
    const list = await getCustomLanguages();
    const idx = list.findIndex((l) => l.id === id);
    const cur = list[idx];
    if (cur === undefined) throw new Error('language-gone');
    const entry = clampLanguageRow(apply(cur));
    if (!entry) throw new Error('invalid-language');
    list[idx] = entry;
    await writeLocal(STORAGE_KEYS.customLanguages, list);
  });
}

export function deleteCustomLanguage(id: string): Promise<void> {
  return withCustomsLock(async () => {
    const list = (await getCustomLanguages()).filter((l) => l.id !== id);
    await writeLocal(STORAGE_KEYS.customLanguages, list);
  });
}

export const withCustomTasksLock = makeCrossContextLock('ega:custom-tasks');

/**
 * Adds or replaces one custom task row. Rejects 'invalid-task' or 'cap-reached', which the Tasks tab words for the user.
 * `at` puts a missing row back at its old place (Undo of a delete); without it a new row goes last.
 */
export function upsertCustomTask(row: CustomTask, at?: number): Promise<void> {
  const parsed = valibot.safeParse(customTaskSchema, row);
  if (!parsed.success) return Promise.reject(new Error('invalid-task'));
  const entry = parsed.output as CustomTask;
  return withCustomTasksLock(async () => {
    const list = await getCustomTasks();
    const idx = list.findIndex((t) => t.id === entry.id);
    if (idx === -1 && list.length >= CUSTOM_TASKS_MAX) throw new Error('cap-reached');
    if (idx === -1) list.splice(at ?? list.length, 0, entry);
    else list[idx] = entry;
    await writeLocal(STORAGE_KEYS.customTasks, list);
  });
}

/** Rewrites an existing row under the lock; rejects 'task-gone' when another window deleted it. */
export function updateCustomTaskRow(
  id: string,
  apply: (cur: CustomTask) => CustomTask,
): Promise<CustomTask> {
  return withCustomTasksLock(async () => {
    const list = await getCustomTasks();
    const idx = list.findIndex((t) => t.id === id);
    const cur = list[idx];
    if (cur === undefined) throw new Error('task-gone');
    const parsed = valibot.safeParse(customTaskSchema, apply(cur));
    if (!parsed.success) throw new Error('invalid-task');
    const entry = parsed.output as CustomTask;
    list[idx] = entry;
    await writeLocal(STORAGE_KEYS.customTasks, list);
    return entry;
  });
}

export function deleteCustomTaskRow(id: string): Promise<void> {
  return withCustomTasksLock(async () => {
    const list = (await getCustomTasks()).filter((t) => t.id !== id);
    await writeLocal(STORAGE_KEYS.customTasks, list);
  });
}

/** Wipes both areas under every writer's lock, so a write that already read the old row cannot put it back. */
export function clearAllStorage(): Promise<void> {
  return withSettingsLock(() =>
    withCustomsLock(() =>
      withCustomTasksLock(() =>
        withConversationLock(async () => {
          await chrome.storage.local.clear();
          await chrome.storage.session.clear();
        }),
      ),
    ),
  );
}

// One read per change event, fanned out — sanitizing the stored row is not cheap enough to do per subscriber.
const settingsListeners = new Set<(s: Settings) => void>();
let settingsChangeToken = 0;
let stopSettingsChanges: (() => void) | null = null;

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  settingsListeners.add(cb);
  stopSettingsChanges ??= onStoredChange((changes) => {
    if (!(STORAGE_KEYS.settings in changes)) return;
    // Two changes issue two parallel reads that can resolve in either order, so an older snapshot is dropped.
    const myToken = ++settingsChangeToken;
    getSettings()
      .then((s) => {
        if (myToken !== settingsChangeToken) return;
        for (const fn of [...settingsListeners]) {
          try {
            fn(s);
          } catch (e) {
            console.warn('[ega.storage] settings listener threw', e);
          }
        }
      })
      .catch(() => {});
  });
  return () => {
    settingsListeners.delete(cb);
    if (settingsListeners.size === 0 && stopSettingsChanges) {
      stopSettingsChanges();
      stopSettingsChanges = null;
    }
  };
}
