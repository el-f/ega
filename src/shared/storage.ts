import { STORAGE_KEYS } from './constants';
import type {
  BackendId,
  CustomLanguage,
  Settings,
  TaskPresetsBundle,
  TaskPresetsImportResult,
  VarietyEdit,
  VarietiesBundle,
  VarietiesImportResult,
} from './types';
import { ALL_TASKS, type Task } from './task-prompts';
import {
  CUSTOM_LANGUAGES_MAX,
  normaliseBackendOrder,
  parseCustomLanguageRows,
  sanitiseStoredSettings,
} from './storage/sanitise';
import { BACKEND_API_KEY_FIELDS } from './provider-ids';
import type { Rule } from './rules';
import { makeCrossContextLock } from './utils/cross-context-lock';
import * as valibot from 'valibot';
import { customLanguageSchema } from './settings-schema';
import { clampToSchema } from './settings-clamp';

async function readLocal<T>(key: string, fallback: T): Promise<T> {
  const r = await chrome.storage.local.get(key);
  return (r[key] as T) ?? fallback;
}

async function writeLocal<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getSettings(): Promise<Settings> {
  const [raw, customs] = await Promise.all([
    readLocal<Record<string, unknown>>(STORAGE_KEYS.settings, {}),
    getCustomLanguages(),
  ]);
  return sanitiseStoredSettings(raw, customs);
}

// A content script's navigator.locks belongs to the page origin and cannot join this one, so content writes go through the SW.
const withSettingsLock = makeCrossContextLock('ega:settings');

export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return withSettingsLock(async () => {
    const cur = await getSettings();
    const merged: Settings = {
      ...cur,
      ...patch,
      model: { ...cur.model, ...patch.model },
      advanced: { ...cur.advanced, ...patch.advanced },
      // Map fields deep-merge, so replacing one wholesale needs the full map passed in.
      sitePrefs: { ...cur.sitePrefs, ...patch.sitePrefs },
      taskBackends: { ...cur.taskBackends, ...patch.taskBackends },
      taskTemperatures: { ...cur.taskTemperatures, ...patch.taskTemperatures },
      taskMaxTokens: { ...cur.taskMaxTokens, ...patch.taskMaxTokens },
      taskReasoningEfforts: { ...cur.taskReasoningEfforts, ...patch.taskReasoningEfforts },
      varietyOverrides: { ...cur.varietyOverrides, ...patch.varietyOverrides },
    };
    const next: Settings = { ...merged, backendOrder: normaliseBackendOrder(merged.backendOrder) };
    const disabled = new Set<string>(merged.disabledBackends);
    // Only a patch that touches the chain can be refused for it; a theme toggle must still save on a row an old import left all-disabled.
    const touchesChain = 'backendOrder' in patch || 'disabledBackends' in patch;
    if (touchesChain && next.backendOrder.every((id) => disabled.has(id))) {
      throw new Error('At least one backend must stay enabled');
    }
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

export function replaceTaskBackends(
  next: NextOrTransform<Settings['taskBackends']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    taskBackends: resolveNext(next, cur.taskBackends),
  }));
}

export function replaceTaskTemperatures(
  next: NextOrTransform<Settings['taskTemperatures']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    taskTemperatures: resolveNext(next, cur.taskTemperatures),
  }));
}

export function replaceTaskMaxTokens(
  next: NextOrTransform<Settings['taskMaxTokens']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    taskMaxTokens: resolveNext(next, cur.taskMaxTokens),
  }));
}

export function replaceTaskReasoningEfforts(
  next: NextOrTransform<Settings['taskReasoningEfforts']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    taskReasoningEfforts: resolveNext(next, cur.taskReasoningEfforts),
  }));
}

export function replaceSnippets(
  next: NextOrTransform<Settings['advanced']['snippets']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    advanced: { ...cur.advanced, snippets: resolveNext(next, cur.advanced.snippets) },
  }));
}

export function replaceTaskTones(
  next: NextOrTransform<Settings['advanced']['taskTones']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    advanced: { ...cur.advanced, taskTones: resolveNext(next, cur.advanced.taskTones) },
  }));
}

export function replaceTaskTemplates(
  next: NextOrTransform<Settings['advanced']['taskTemplates']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    advanced: { ...cur.advanced, taskTemplates: resolveNext(next, cur.advanced.taskTemplates) },
  }));
}

export function replaceUserRecipes(
  next: NextOrTransform<Settings['advanced']['userRecipes']>,
): Promise<Settings> {
  return replaceSettingsField((cur) => ({
    ...cur,
    advanced: { ...cur.advanced, userRecipes: resolveNext(next, cur.advanced.userRecipes) },
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

// Never throws on a bad row: getSettings awaits this, so a rejection leaves every surface with no settings.
export async function getCustomLanguages(): Promise<CustomLanguage[]> {
  const raw = await readLocal<unknown>(STORAGE_KEYS.customLanguages, []);
  if (!Array.isArray(raw)) {
    console.warn(
      `[ega.storage] ${STORAGE_KEYS.customLanguages} is not an array — reading as empty`,
    );
    return [];
  }
  return parseCustomLanguageRows(raw, 'keep');
}

const withCustomsLock = makeCrossContextLock('ega:custom-languages');

export function upsertCustomLanguage(lang: CustomLanguage): Promise<void> {
  // Clamp to the schema here, or the reader has to drop the whole entry later.
  const clamped = valibot.safeParse(
    customLanguageSchema,
    clampToSchema(customLanguageSchema, lang),
  );
  // 'invalid-language' and 'cap-reached' are the two messages the Languages tab turns into its own copy.
  if (!clamped.success) return Promise.reject(new Error('invalid-language'));
  const entry = clamped.output as CustomLanguage;
  return withCustomsLock(async () => {
    const list = await getCustomLanguages();
    const idx = list.findIndex((l) => l.id === entry.id);
    if (idx === -1 && list.length >= CUSTOM_LANGUAGES_MAX) throw new Error('cap-reached');
    if (idx === -1) list.push(entry);
    else list[idx] = entry;
    await writeLocal(STORAGE_KEYS.customLanguages, list);
  });
}

export function deleteCustomLanguage(id: string): Promise<void> {
  return withCustomsLock(async () => {
    const list = (await getCustomLanguages()).filter((l) => l.id !== id);
    await writeLocal(STORAGE_KEYS.customLanguages, list);
  });
}

function setCustomLanguages(list: CustomLanguage[]): Promise<void> {
  return withCustomsLock(async () => {
    await writeLocal(STORAGE_KEYS.customLanguages, list);
  });
}

/** Wipes both areas under the settings and custom-language locks, so a write that already read the old row cannot put it back. */
export function clearAllStorage(): Promise<void> {
  return withSettingsLock(() =>
    withCustomsLock(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.session.clear();
    }),
  );
}

export async function exportVarieties(): Promise<VarietiesBundle> {
  const [settings, customLanguages] = await Promise.all([getSettings(), getCustomLanguages()]);
  return {
    egaVarieties: {
      v: 1,
      exportedAt: new Date().toISOString(),
      customLanguages,
      varietyOverrides: settings.varietyOverrides,
      disabledVarieties: settings.disabledVarieties,
    },
  };
}

type VarietiesPlan = {
  kind: 'varieties';
  customLanguages: CustomLanguage[];
  varietyOverrides: Record<string, VarietyEdit>;
  disabledVarieties: string[];
  /** Raw counts from the file, for the confirm copy. */
  fileCounts: { customLanguages: number; varietyOverrides: number };
  result: VarietiesImportResult;
};

type TaskPresetsPlan = {
  kind: 'taskPresets';
  presets: TaskPresetsBundle['egaTaskPresets'];
  taskBackends: Partial<Record<Task, 'auto' | BackendId>>;
  result: TaskPresetsImportResult;
};

type SettingsPlan = {
  kind: 'settings';
  settings: Settings;
  customLanguages: CustomLanguage[];
};

/** A schema-checked bundle with its writes already decided. The UI confirms on this, then `importBundle` writes it. */
export type ImportBundle = VarietiesPlan | TaskPresetsPlan | SettingsPlan;

/** Drops the `undefined` holes a Partial<Record<Task, T>> carries, so the bundle
 *  serializes to the keys the user actually set. */
function definedTaskEntries<T>(
  src: Partial<Record<Task, T>> | undefined,
): Partial<Record<Task, T>> {
  const out: Partial<Record<Task, T>> = {};
  for (const t of ALL_TASKS) {
    const value = src?.[t];
    if (value !== undefined) out[t] = value;
  }
  return out;
}

export async function exportTaskPresets(): Promise<TaskPresetsBundle> {
  const settings = await getSettings();
  return {
    egaTaskPresets: {
      v: 1,
      exportedAt: new Date().toISOString(),
      taskTemplates: settings.advanced.taskTemplates,
      taskBackends: definedTaskEntries(settings.taskBackends),
      taskTemperatures: definedTaskEntries(settings.taskTemperatures),
      taskMaxTokens: definedTaskEntries(settings.taskMaxTokens),
      taskReasoningEfforts: definedTaskEntries(settings.taskReasoningEfforts),
      taskTones: definedTaskEntries(settings.advanced.taskTones),
      defaultTask: settings.defaultTask,
      defaultTone: settings.defaultTone,
    },
  };
}

interface ExportBundle {
  version: 1;
  exportedAt: string;
  settings: Settings;
  customLanguages: CustomLanguage[];
}

interface ExportOptions {
  includeApiKeys?: boolean;
}

export async function exportAll(opts: ExportOptions = {}): Promise<ExportBundle> {
  const settings = await getSettings();
  // Stripping the keys guards the billing account only — the glossary, custom-language examples and site hosts stay in the file.
  let safeSettings: Settings = settings;
  if (!opts.includeApiKeys) {
    const stripped = { ...settings };
    for (const k of BACKEND_API_KEY_FIELDS) delete stripped[k];
    safeSettings = stripped;
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: safeSettings,
    customLanguages: await getCustomLanguages(),
  };
}

export interface ImportOptions {
  /** Default false — strip bundle keys so a shared file can't replace live ones. */
  includeApiKeys?: boolean;
}

export async function importBundle(bundle: ImportBundle, opts: ImportOptions = {}): Promise<void> {
  switch (bundle.kind) {
    case 'varieties': {
      // Not atomic across the two locks: a failed settings write leaves the customs already written.
      await setCustomLanguages(bundle.customLanguages);
      // One write, and it replaces rather than merges — a merge keeps overrides the bundle dropped.
      await replaceSettingsField((cur) => ({
        ...cur,
        disabledVarieties: bundle.disabledVarieties,
        varietyOverrides: bundle.varietyOverrides,
      }));
      return;
    }
    case 'taskPresets': {
      const { taskTemplates, taskTemperatures, taskMaxTokens, taskReasoningEfforts, taskTones } =
        bundle.presets;
      const { defaultTask, defaultTone } = bundle.presets;
      // Replace, not merge, or per-task pins the bundle dropped survive; a v1 bundle lacks the last three maps, so an absent one keeps the user's.
      await replaceSettingsField((cur) => ({
        ...cur,
        defaultTask,
        defaultTone,
        taskBackends: bundle.taskBackends,
        taskTemperatures,
        ...(taskMaxTokens ? { taskMaxTokens } : {}),
        ...(taskReasoningEfforts ? { taskReasoningEfforts } : {}),
        advanced: { ...cur.advanced, taskTemplates, ...(taskTones ? { taskTones } : {}) },
      }));
      return;
    }
    case 'settings': {
      // Nested acquisition is safe here, because the two locks guard disjoint storage keys.
      await withSettingsLock(async () => {
        await withCustomsLock(async () => {
          // Copy first: the loop below writes and deletes fields the caller may still hold a reference to.
          const settings = { ...bundle.settings };
          if (!opts.includeApiKeys) {
            // The confirm dialog promises "use your current keys", so strip-keys mode re-attaches them before the write.
            const current = await getSettings();
            for (const k of BACKEND_API_KEY_FIELDS) {
              const v = current[k];
              if (v === undefined) delete settings[k];
              else settings[k] = v;
            }
          }
          await chrome.storage.local.set({
            [STORAGE_KEYS.settings]: settings,
            [STORAGE_KEYS.customLanguages]: bundle.customLanguages,
          });
        });
      });
      return;
    }
  }
}

// One read per change event, fanned out — sanitizing the stored row is not cheap enough to do per subscriber.
const settingsListeners = new Set<(s: Settings) => void>();
let settingsChangeToken = 0;
let settingsChangeHandler: ((c: Record<string, chrome.storage.StorageChange>) => void) | null =
  null;

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  settingsListeners.add(cb);
  if (!settingsChangeHandler) {
    settingsChangeHandler = (changes) => {
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
    };
    chrome.storage.local.onChanged.addListener(settingsChangeHandler);
  }
  return () => {
    settingsListeners.delete(cb);
    if (settingsListeners.size === 0 && settingsChangeHandler) {
      chrome.storage.local.onChanged.removeListener(settingsChangeHandler);
      settingsChangeHandler = null;
    }
  };
}
