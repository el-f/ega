import * as valibot from 'valibot';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { importBundle, type ImportBundle, type ImportOptions } from '@/shared/storage';
import {
  CUSTOM_LANGUAGES_MAX,
  parseCustomLanguageRows,
  sanitiseStoredSettings,
} from '@/shared/storage/sanitise';
import { isPlainObject } from '@/shared/settings-clamp';
import { getRegisteredBackendIds } from '@/shared/backends/registry';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { ALL_TASKS, type Task } from '@/shared/task-prompts';
import {
  customLanguageSchema,
  taskPresetsBundleSchema,
  varietiesBundleLenientSchema,
} from '@/shared/settings-schema';
import type {
  BackendId,
  CustomLanguage,
  Settings,
  TaskPresetsBundle,
  VarietyEdit,
} from '@/shared/types';

const IMPORT_NOT_JSON_MESSAGE =
  'This file is not valid JSON. Re-export the bundle from your Ega install, or double-check you picked the right file.';

function issuePath(issue: valibot.BaseIssue<unknown>): string {
  return (issue.path ?? []).map((p) => String((p as { key: unknown }).key)).join('.');
}

// A raw "Invalid type" from the schema never tells the user the bundle came from another Ega version.
function bundleParseError(e: unknown, rootKey: string, label: string, raw: unknown): Error {
  if (!valibot.isValiError(e)) return new Error(`Invalid ${label}: ${String(e)}`, { cause: e });
  if (e.issues.some((i) => issuePath(i) === `${rootKey}.v`)) {
    const root = isPlainObject(raw) ? raw[rootKey] : undefined;
    const actualV = isPlainObject(root) ? (root['v'] ?? '?') : '?';
    return new Error(
      `Bundle exported by a different Ega version (v=${String(actualV)}). Upgrade Ega to import.`,
      { cause: e },
    );
  }
  const summary = e.issues.map((i) => `${issuePath(i)}: ${i.message}`).join('; ');
  return new Error(`Invalid ${label}: ${summary}`, { cause: e });
}

function parseVarietiesBundle(raw: unknown): Extract<ImportBundle, { kind: 'varieties' }> {
  let lenientParsed: valibot.InferOutput<typeof varietiesBundleLenientSchema>;
  try {
    lenientParsed = valibot.parse(varietiesBundleLenientSchema, raw);
  } catch (e) {
    throw bundleParseError(e, 'egaVarieties', 'varieties bundle', raw);
  }

  const {
    customLanguages: rawCustoms,
    varietyOverrides,
    disabledVarieties,
  } = lenientParsed.egaVarieties;

  const builtinIds = new Set<string>(BUILT_IN_PRESETS.map((p) => p.id));

  // Per-entry validation so one bad item doesn't block the bundle.
  const customLanguages: CustomLanguage[] = [];
  const incomingCustomIds = new Set<string>();
  let skippedMalformedCustoms = 0;
  let droppedCollidingCustoms = 0;
  for (const entry of rawCustoms) {
    if (customLanguages.length >= CUSTOM_LANGUAGES_MAX) break;
    const result = valibot.safeParse(customLanguageSchema, entry);
    if (!result.success) {
      skippedMalformedCustoms++;
      continue;
    }
    const lang = result.output;
    if (builtinIds.has(lang.id) || incomingCustomIds.has(lang.id)) {
      droppedCollidingCustoms++;
      continue;
    }
    incomingCustomIds.add(lang.id);
    customLanguages.push(lang);
  }

  const knownIds = new Set<string>([...builtinIds, ...incomingCustomIds]);

  const droppedDanglingOverrides: string[] = [];
  const cleanOverrides: Record<string, VarietyEdit> = {};
  for (const [id, edit] of Object.entries(varietyOverrides)) {
    if (builtinIds.has(id)) cleanOverrides[id] = edit as VarietyEdit;
    else droppedDanglingOverrides.push(id);
  }

  const droppedUnknownDisabled: string[] = [];
  const cleanDisabled: string[] = [];
  for (const id of disabledVarieties) {
    if (knownIds.has(id)) cleanDisabled.push(id);
    else droppedUnknownDisabled.push(id);
  }

  return {
    kind: 'varieties',
    customLanguages,
    varietyOverrides: cleanOverrides,
    disabledVarieties: cleanDisabled,
    fileCounts: {
      customLanguages: rawCustoms.length,
      varietyOverrides: Object.keys(varietyOverrides).length,
    },
    result: {
      customLanguagesAdded: customLanguages.length,
      varietyOverridesApplied: Object.keys(cleanOverrides).length,
      disabledVarietiesApplied: cleanDisabled.length,
      droppedDanglingOverrides,
      droppedUnknownDisabled,
      skippedMalformedCustoms,
      droppedCollidingCustoms,
    },
  };
}

function parseTaskPresetsBundle(raw: unknown): Extract<ImportBundle, { kind: 'taskPresets' }> {
  let parsed: TaskPresetsBundle;
  try {
    parsed = valibot.parse(taskPresetsBundleSchema, raw);
  } catch (e) {
    throw bundleParseError(e, 'egaTaskPresets', 'task presets bundle', raw);
  }
  const presets = parsed.egaTaskPresets;

  const registeredIds = new Set(getRegisteredBackendIds());
  const taskBackends: Partial<Record<Task, 'auto' | BackendId>> = {};
  const droppedUnknownBackends: string[] = [];
  for (const t of ALL_TASKS) {
    const v = presets.taskBackends[t];
    if (!v) continue;
    if (v === 'auto' || registeredIds.has(v as BackendId)) {
      taskBackends[t] = v as 'auto' | BackendId;
    } else {
      droppedUnknownBackends.push(v);
    }
  }

  return {
    kind: 'taskPresets',
    presets,
    taskBackends,
    result: {
      taskTemplatesApplied: Object.keys(presets.taskTemplates).length,
      taskBackendsApplied: Object.keys(taskBackends).length,
      taskTemperaturesApplied: Object.keys(presets.taskTemperatures).length,
      droppedUnknownBackends,
    },
  };
}

// The read-path sanitizer, so a bundle lands exactly as a stored row reads back.
function validateSettings(
  raw: Record<string, unknown>,
  customs: readonly CustomLanguage[],
): Settings {
  const settings = sanitiseStoredSettings(raw, customs);
  // The write path refuses an all-disabled chain, and a row that lands that way makes every later save fail.
  const disabled = new Set<string>(settings.disabledBackends);
  const first = settings.backendOrder[0];
  if (first !== undefined && settings.backendOrder.every((id) => disabled.has(id))) {
    console.warn(`[ega.storage] import disabled every backend; re-enabling ${first}`);
    settings.disabledBackends = settings.disabledBackends.filter((id) => id !== first);
  }
  return settings;
}

function validateCustomLanguages(raw: unknown): CustomLanguage[] {
  if (!Array.isArray(raw)) throw new Error('bundle.customLanguages must be an array');
  return parseCustomLanguageRows(raw, 'drop');
}

function parseSettingsBundle(
  raw: Record<string, unknown>,
): Extract<ImportBundle, { kind: 'settings' }> {
  if (raw['version'] !== 1) throw new Error('unsupported bundle version (expected 1)');
  if (!('settings' in raw)) throw new Error('bundle missing settings');
  if (!('customLanguages' in raw)) throw new Error('bundle missing customLanguages');
  const settings = raw['settings'];
  if (!isPlainObject(settings)) throw new Error('bundle.settings must be an object');
  const customLanguages = validateCustomLanguages(raw['customLanguages']);
  return {
    kind: 'settings',
    settings: validateSettings(settings, customLanguages),
    customLanguages,
  };
}

/** Tells the three export shapes apart by their root key and schema-checks the one it finds; throws before anything is written. */
export function parseImportBundle(raw: unknown): ImportBundle {
  if (isPlainObject(raw)) {
    if ('egaTaskPresets' in raw) return parseTaskPresetsBundle(raw);
    if ('egaVarieties' in raw) return parseVarietiesBundle(raw);
    if ('version' in raw) return parseSettingsBundle(raw);
  }
  throw new Error('This file is not an Ega export — nothing was changed.');
}

export type ImportStatus = { kind: 'ok' | 'err'; msg: string };

export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Null means the user backed out. */
async function confirmImport(bundle: ImportBundle): Promise<ImportOptions | null> {
  switch (bundle.kind) {
    case 'taskPresets': {
      const proceed = await confirmDialog({
        title: 'Replace task presets?',
        body: 'Existing per-task templates, backends, temperatures, token limits, reasoning efforts, tones, and default task/tone will be replaced by the imported bundle. This cannot be undone.',
        confirmLabel: 'Replace',
        danger: true,
      });
      return proceed ? {} : null;
    }
    case 'varieties': {
      const proceed = await confirmDialog({
        title: 'Replace your custom languages and edits?',
        body:
          `The file contains ${count(bundle.fileCounts.customLanguages, 'custom language')} and ` +
          `${count(bundle.fileCounts.varietyOverrides, 'override')}. Importing replaces your existing custom ` +
          'languages and built-in edits. This cannot be undone.',
        confirmLabel: 'Replace',
        danger: true,
      });
      return proceed ? {} : null;
    }
    case 'settings': {
      const proceed = await confirmDialog({
        title: 'Import settings',
        body: 'Importing will overwrite your current settings and custom languages. Continue?',
        confirmLabel: 'Continue',
        danger: true,
      });
      if (!proceed) return null;
      const includeApiKeys = await confirmDialog({
        title: 'Keep API keys from file?',
        body: 'Keep API keys from the imported file (dangerous if the file came from someone else), or strip them and use your current keys?',
        confirmLabel: 'Keep keys',
        cancelLabel: 'Strip keys',
      });
      return { includeApiKeys };
    }
  }
}

function summary(bundle: ImportBundle): string {
  switch (bundle.kind) {
    case 'taskPresets': {
      const r = bundle.result;
      const drops = r.droppedUnknownBackends.length;
      return (
        `Imported ${count(r.taskTemplatesApplied, 'template')}, ` +
        `${count(r.taskBackendsApplied, 'backend pin')}, ` +
        `${count(r.taskTemperaturesApplied, 'temperature')}.` +
        (drops > 0 ? ` Dropped ${count(drops, 'unknown backend id')}.` : '')
      );
    }
    case 'varieties': {
      const r = bundle.result;
      const drops = r.droppedDanglingOverrides.length + r.droppedUnknownDisabled.length;
      return (
        `Imported ${count(r.customLanguagesAdded, 'custom language')}, ` +
        `${count(r.varietyOverridesApplied, 'override')}, ` +
        `${count(r.disabledVarietiesApplied, 'disabled language')}.` +
        (drops > 0 ? ` Skipped ${count(drops, 'unknown entry', 'unknown entries')}.` : '') +
        (r.skippedMalformedCustoms > 0
          ? ` Skipped ${count(r.skippedMalformedCustoms, 'broken custom entry', 'broken custom entries')}.`
          : '') +
        (r.droppedCollidingCustoms > 0
          ? ` Dropped ${count(r.droppedCollidingCustoms, 'custom entry', 'custom entries')} with an id that is already taken.`
          : '')
      );
    }
    case 'settings':
      return 'Imported all settings.';
  }
}

const KIND_LABEL: Record<ImportBundle['kind'], string> = {
  settings: 'a full settings backup',
  taskPresets: 'a task-presets file',
  varieties: 'a languages export',
};

/**
 * Reads, sniffs and schema-checks the file before the destructive confirm, so a bad pick never asks for one.
 * `expectedKind` narrows a scoped row to the one kind its label promises; omit it on the whole-backup row.
 * Null means canceled.
 */
export async function importBundleFile(
  file: File,
  expectedKind?: ImportBundle['kind'],
): Promise<ImportStatus | null> {
  let bundle: ImportBundle;
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error(IMPORT_NOT_JSON_MESSAGE);
    }
    bundle = parseImportBundle(parsed);
  } catch (e) {
    return { kind: 'err', msg: `Import failed: ${(e as Error).message}` };
  }
  if (expectedKind && bundle.kind !== expectedKind) {
    return {
      kind: 'err',
      msg:
        `This file is ${KIND_LABEL[bundle.kind]}, not ${KIND_LABEL[expectedKind]} — nothing was changed. ` +
        'Restore it from Advanced → Backup & restore.',
    };
  }
  const opts = await confirmImport(bundle);
  if (!opts) return null;
  try {
    await importBundle(bundle, opts);
    return { kind: 'ok', msg: summary(bundle) };
  } catch (e) {
    return { kind: 'err', msg: `Import failed: ${(e as Error).message}` };
  }
}
