import { isSlowPattern } from '@/shared/regex-risk';
import { count } from '@/shared/utils/count';
import * as valibot from 'valibot';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { getCustomLanguages, getCustomTasks, readCustomLanguages } from '@/shared/storage';
import {
  importBundle,
  type GlossaryMerge,
  type ImportBundle,
  type ImportOptions,
} from '@/shared/storage/backup';
import {
  CUSTOM_LANGUAGES_MAX,
  parseCustomLanguageRows,
  parseCustomTaskRows,
  sanitiseStoredSettings,
  withKnownGlossaryScopes,
  withoutShippedFields,
  withoutShippedTaskFields,
} from '@/shared/storage/sanitise';
import { ALL_TASKS, builtInTask } from '@/shared/task-prompts';
import type { CustomTask } from '@/shared/settings-schema';
import {
  glossaryBundleLenientSchema,
  languageBundleLenientSchema,
  tasksBundleLenientSchema,
  varietiesBundleLenientSchema,
} from './bundle-schemas';
import { clampToSchema, isPlainObject } from '@/shared/settings-clamp';
import { BACKEND_API_KEY_FIELDS } from '@/shared/provider-ids';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { LANG_ID_PATTERN } from '@/shared/brands';
import {
  customLanguageSchema,
  DETECT_FLAGS_MAX,
  DETECT_PATTERN_MAX,
  GLOSSARY_MAX,
  glossaryEntrySchema,
  languagePromptSchema,
  promptTemplate,
  type LanguagePrompt,
  snippetsSchema,
  taskEditSchema,
  varietyEditSchema,
} from '@/shared/settings-schema';
import type { CustomLanguage, Settings, VarietyEdit } from '@/shared/types';

const templateVersionSchema = valibot.pipe(
  valibot.number(),
  valibot.integer(),
  valibot.minValue(0),
);

/** An imported language may not take an id the read path treats as a language code or as Auto-detect: its prompt and hint would then run for that code. */
function isLanguageCodeLike(id: string): boolean {
  return id === 'auto' || LANG_ID_PATTERN.test(id);
}

/** A detection pattern over its cap is dropped, never cut: a cut pattern matches something else, or nothing. */
function withoutOverlongDetect(row: Record<string, unknown>): Record<string, unknown> {
  const ad = row['autoDetect'];
  const over =
    isPlainObject(ad) &&
    ((typeof ad['regex'] === 'string' && ad['regex'].length > DETECT_PATTERN_MAX) ||
      (typeof ad['flags'] === 'string' && ad['flags'].length > DETECT_FLAGS_MAX));
  const slow =
    isPlainObject(ad) &&
    typeof ad['regex'] === 'string' &&
    isSlowPattern(ad['regex'], typeof ad['flags'] === 'string' ? ad['flags'] : '');
  if (!over && !slow) return row;
  const { autoDetect: _drop, ...rest } = row;
  return rest;
}

/** A new code-like id is refused; one the user already has stays, so restoring an older import keeps it. */
function refusedId(id: unknown, ownIds: ReadonlySet<string>): boolean {
  return typeof id === 'string' && isLanguageCodeLike(id) && !ownIds.has(id);
}

/** The ids of the custom languages the user has now; none while the stored list is unreadable. */
async function ownLanguageIds(): Promise<Set<string>> {
  return new Set(((await readCustomLanguages()) ?? []).map((c) => c.id));
}

/** Imported rows through the stored-row reader, minus a refused id and an over-long pattern. */
function importedLanguageRows(
  raw: readonly unknown[],
  ownIds: ReadonlySet<string>,
): CustomLanguage[] {
  const rows = raw
    .filter((c) => !(isPlainObject(c) && refusedId(c['id'], ownIds)))
    .map((c) => (isPlainObject(c) ? withoutOverlongDetect(c) : c));
  return parseCustomLanguageRows(rows, 'drop');
}

/** A full backup's built-in edits go through the settings clamp, which would cut a pattern; drop an over-long one first. */
function withoutOverlongEditPatterns(settings: Record<string, unknown>): Record<string, unknown> {
  const edits = settings['varietyOverrides'];
  if (!isPlainObject(edits)) return settings;
  const checked = Object.fromEntries(
    Object.entries(edits).map(([id, e]) => [id, isPlainObject(e) ? withoutOverlongDetect(e) : e]),
  );
  return { ...settings, varietyOverrides: checked };
}

/** A file's snippet map, when it is well formed; a bad one is dropped and the prompts keep their @@refs. */
function fileSnippets(raw: unknown): { snippets?: Record<string, string> } {
  if (raw === undefined) return {};
  const parsed = valibot.safeParse(snippetsSchema, raw);
  return parsed.success ? { snippets: parsed.output } : {};
}

const NOT_A_BACKUP = 'This file is not an Ega backup. Pick a file you exported from Ega.';
const TOO_NEW = 'This backup is from a newer Ega. Update Ega, then import it.';

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

async function parseVarietiesBundle(
  raw: unknown,
): Promise<Extract<ImportBundle, { kind: 'varieties' }>> {
  let lenientParsed: valibot.InferOutput<typeof varietiesBundleLenientSchema>;
  try {
    lenientParsed = valibot.parse(varietiesBundleLenientSchema, raw);
  } catch (e) {
    throw bundleParseError(e, 'egaVarieties', 'varieties bundle', raw);
  }

  const file = lenientParsed.egaVarieties;
  const rawCustoms = file.customLanguages;
  const builtinIds = new Set<string>(BUILT_IN_PRESETS.map((p) => p.id));
  // A row, an edit or a prompt that fails its schema is skipped and counted; so is a map or list of the wrong type.
  let skippedBroken = 0;
  /** A part the file leaves out or breaks is undefined, so the current one stays. */
  function partOf<T>(value: unknown, ok: (x: unknown) => x is T): T | undefined {
    if (value === undefined || ok(value)) return value as T | undefined;
    skippedBroken++;
    return undefined;
  }
  /** A pattern over its cap is dropped, not cut, and counted. */
  function withPatternChecked(row: Record<string, unknown>): Record<string, unknown> {
    const checked = withoutOverlongDetect(row);
    if (checked !== row) skippedBroken++;
    return checked;
  }

  // Clamped and stamped as the full backup does, so a long field is cut rather than the row dropped.
  const customLanguages: CustomLanguage[] = [];
  const incomingCustomIds = new Set<string>();
  const ownIds = await ownLanguageIds();
  let droppedCollidingCustoms = 0;
  let droppedCodeLikeCustoms = 0;
  for (const entry of rawCustoms) {
    if (customLanguages.length >= CUSTOM_LANGUAGES_MAX) break;
    const stamped = isPlainObject(entry)
      ? withPatternChecked(
          typeof entry['createdAt'] === 'number' ? entry : { ...entry, createdAt: Date.now() },
        )
      : entry;
    const result = valibot.safeParse(
      customLanguageSchema,
      clampToSchema(customLanguageSchema, stamped),
    );
    if (!result.success) {
      skippedBroken++;
      continue;
    }
    const lang = result.output;
    if (builtinIds.has(lang.id) || incomingCustomIds.has(lang.id)) {
      droppedCollidingCustoms++;
      continue;
    }
    // A new code-like id would make this language's prompt and hint run for that code.
    if (refusedId(lang.id, ownIds)) {
      droppedCodeLikeCustoms++;
      continue;
    }
    incomingCustomIds.add(lang.id);
    customLanguages.push(lang);
  }

  const knownIds = new Set<string>([...builtinIds, ...incomingCustomIds]);

  const droppedDanglingOverrides: string[] = [];
  const cleanOverrides: Record<string, VarietyEdit> = {};
  const fileOverrides = partOf(file.varietyOverrides, isPlainObject);
  for (const [id, rawEdit] of Object.entries(fileOverrides ?? {})) {
    if (!builtinIds.has(id)) {
      droppedDanglingOverrides.push(id);
      continue;
    }
    const checked = isPlainObject(rawEdit) ? withPatternChecked(rawEdit) : rawEdit;
    const edit = valibot.safeParse(varietyEditSchema, clampToSchema(varietyEditSchema, checked));
    if (!edit.success) {
      skippedBroken++;
      continue;
    }
    const kept = withoutShippedFields(id, edit.output) as VarietyEdit;
    if (Object.keys(kept).length > 0) cleanOverrides[id] = kept;
  }

  // A prompt for a language the file does not bring is dropped; one that fails the schema is skipped.
  const presetTemplates: Record<string, LanguagePrompt> = {};
  const rawTemplates = partOf(file.presetTemplates, isPlainObject);
  for (const [id, rawTpl] of Object.entries(rawTemplates ?? {})) {
    // Clamped first, as the one-language file is, so a newer file's extra key does not break it.
    const tpl = valibot.safeParse(
      languagePromptSchema,
      clampToSchema(languagePromptSchema, rawTpl),
    );
    if (!knownIds.has(id)) droppedDanglingOverrides.push(id);
    else if (!tpl.success) skippedBroken++;
    else presetTemplates[id] = tpl.output;
  }

  const droppedUnknownDisabled: string[] = [];
  const cleanDisabled = new Set<string>();
  const fileDisabled = partOf(file.disabledVarieties, Array.isArray) as unknown[] | undefined;
  for (const id of fileDisabled ?? []) {
    if (typeof id !== 'string') skippedBroken++;
    else if (knownIds.has(id)) cleanDisabled.add(id);
    else droppedUnknownDisabled.push(id);
  }

  return {
    kind: 'varieties',
    customLanguages,
    ...(fileOverrides ? { varietyOverrides: cleanOverrides } : {}),
    ...(fileDisabled ? { disabledVarieties: [...cleanDisabled] } : {}),
    ...(file.v === 2 && rawTemplates ? { presetTemplates } : {}),
    ...fileSnippets(file.snippets),
    fileCounts: {
      customLanguages: rawCustoms.length,
      varietyOverrides: Object.keys(fileOverrides ?? {}).length,
      presetTemplates: Object.keys(rawTemplates ?? {}).length,
    },
    result: {
      customLanguagesAdded: customLanguages.length,
      varietyOverridesApplied: Object.keys(cleanOverrides).length,
      disabledVarietiesApplied: cleanDisabled.size,
      droppedDanglingOverrides,
      droppedUnknownDisabled,
      skippedBroken,
      droppedCollidingCustoms,
      droppedCodeLikeCustoms,
      presetTemplatesApplied: Object.keys(presetTemplates).length,
    },
  };
}

function parseTasksBundle(raw: unknown): Extract<ImportBundle, { kind: 'tasks' }> {
  const parsed = valibot.safeParse(tasksBundleLenientSchema, raw);
  if (!parsed.success) throw new Error('This tasks file is damaged — nothing was changed.');
  const file = parsed.output.egaTasks;
  if (file.v > 2) throw new Error(TOO_NEW);
  if (file.v !== 1 && file.v !== 2)
    throw new Error('This tasks file is damaged — nothing was changed.');

  // A bad row, a repeated id, an id a built-in has, or a row past the cap is skipped and counted.
  const customTasks = parseCustomTaskRows(file.customTasks, 'drop');
  let skipped = file.customTasks.length - customTasks.length;

  // A map or list of the wrong type counts as one skipped part; the rest of the file still imports.
  const fileOverrides = isPlainObject(file.taskOverrides) ? file.taskOverrides : {};
  if (file.taskOverrides !== undefined && !isPlainObject(file.taskOverrides)) skipped++;
  const fileDisabled: unknown[] = Array.isArray(file.disabledTasks) ? file.disabledTasks : [];
  if (file.disabledTasks !== undefined && !Array.isArray(file.disabledTasks)) skipped++;

  const taskOverrides: Settings['taskOverrides'] = {};
  for (const [id, rawEdit] of Object.entries(fileOverrides)) {
    const t = builtInTask(id);
    // Clamped first, so a field this build does not know is dropped and the rest of the edit kept.
    const edit = t
      ? valibot.safeParse(taskEditSchema, clampToSchema(taskEditSchema, rawEdit))
      : null;
    if (!t || !edit?.success) {
      skipped++;
      continue;
    }
    const pruned = withoutShippedTaskFields(t, edit.output);
    if (Object.keys(pruned).length > 0) taskOverrides[t] = pruned;
  }

  const known = new Set<string>([...ALL_TASKS, ...customTasks.map((c) => c.id)]);
  const disabledTasks = [
    ...new Set(
      fileDisabled.filter(
        (id): id is string => typeof id === 'string' && id !== 'translate' && known.has(id),
      ),
    ),
  ];
  skipped += fileDisabled.length - disabledTasks.length;

  // A damaged prompt keeps the current one rather than resetting it.
  let translatePrompt: Extract<ImportBundle, { kind: 'tasks' }>['translatePrompt'];
  if (file.v === 2 && file.translatePrompt === null) translatePrompt = null;
  else if (file.v === 2 && isPlainObject(file.translatePrompt)) {
    const { templateVersion, ...halves } = file.translatePrompt;
    const tpl = valibot.safeParse(promptTemplate, halves);
    const version = valibot.safeParse(templateVersionSchema, templateVersion);
    if (tpl.success && version.success) {
      translatePrompt = { template: tpl.output, version: version.output };
    } else skipped++;
  } else if (file.v === 2) skipped++;

  return {
    kind: 'tasks',
    customTasks,
    taskOverrides,
    disabledTasks,
    ...(translatePrompt !== undefined ? { translatePrompt } : {}),
    ...fileSnippets(file.snippets),
    fileCounts: {
      customTasks: file.customTasks.length,
      taskOverrides: Object.keys(fileOverrides).length,
    },
    skipped,
  };
}

async function parseLanguageBundle(
  raw: unknown,
): Promise<Extract<ImportBundle, { kind: 'language' }>> {
  const parsed = valibot.safeParse(languageBundleLenientSchema, raw);
  if (!parsed.success) throw new Error('This language file is damaged — nothing was changed.');
  const file = parsed.output.egaLanguage;
  if (file.v > 1) throw new Error(TOO_NEW);
  if (file.v !== 1) throw new Error('This language file is damaged — nothing was changed.');
  const rawId = isPlainObject(file.language) ? file.language['id'] : undefined;
  if (BUILT_IN_PRESETS.some((p) => p.id === rawId)) {
    throw new Error('This language has the id of a built-in language — nothing was changed.');
  }
  const ownIds = await ownLanguageIds();
  if (refusedId(rawId, ownIds)) {
    throw new Error('This language has an id that reads as a language code — nothing was changed.');
  }
  // A shared pattern could claim the Auto-detect text of every page for this file's prompt, so it never comes in, and is never run.
  const filePattern = isPlainObject(file.language) ? file.language['autoDetect'] : undefined;
  const { autoDetect: _pattern, ...fileRow } = isPlainObject(file.language) ? file.language : {};
  // The stored-row reader: clamped and stamped.
  const [withoutPattern] = importedLanguageRows([fileRow], ownIds);
  if (!withoutPattern) throw new Error('This language file is damaged — nothing was changed.');
  // Clamped first, so a key this build does not know is dropped; a prompt that still fails is left out.
  const prompt = valibot.safeParse(
    languagePromptSchema,
    clampToSchema(languagePromptSchema, file.prompt),
  );
  const existing = (await getCustomLanguages()).find((c) => c.id === withoutPattern.id);
  const language = existing?.autoDetect
    ? { ...withoutPattern, autoDetect: existing.autoDetect }
    : withoutPattern;
  return {
    kind: 'language',
    language,
    patternDropped: filePattern !== undefined,
    ...(file.prompt !== undefined && prompt.success ? { prompt: prompt.output } : {}),
    ...fileSnippets(file.snippets),
    replaces: existing?.label ?? null,
    promptBroken: file.prompt !== undefined && !prompt.success,
  };
}

async function parseGlossaryBundle(
  raw: unknown,
): Promise<Extract<ImportBundle, { kind: 'glossary' }>> {
  const parsed = valibot.safeParse(glossaryBundleLenientSchema, raw);
  if (!parsed.success) throw new Error('This glossary file is damaged — nothing was changed.');
  const file = parsed.output.egaGlossary;
  if (file.v > 1) throw new Error(TOO_NEW);
  if (file.v !== 1) throw new Error('This glossary file is damaged — nothing was changed.');
  // Clamped first, as a stored entry is, so an over-long term is cut rather than the entry dropped.
  const checked = file.entries.flatMap((e) => {
    const r = valibot.safeParse(glossaryEntrySchema, clampToSchema(glossaryEntrySchema, e));
    return r.success ? [r.output] : [];
  });
  // Unreadable custom rows keep every scope, as the settings read does.
  const entries = withKnownGlossaryScopes(checked, await readCustomLanguages());
  return { kind: 'glossary', entries, skipped: file.entries.length - entries.length };
}

// The read-path sanitizer, so a bundle lands exactly as a stored row reads back.
function validateSettings(
  raw: Record<string, unknown>,
  customs: readonly CustomLanguage[],
  customTasks: readonly CustomTask[],
  goneLangIds: ReadonlySet<string>,
): Settings {
  const settings = sanitiseStoredSettings(raw, customs, {
    apiKeysKnown: false,
    customTasks,
    goneLangIds,
  });
  // The write path refuses an all-disabled chain, and a row that lands that way makes every later save fail.
  const disabled = new Set<string>(settings.disabledBackends);
  const first = settings.backendOrder[0];
  if (first !== undefined && settings.backendOrder.every((id) => disabled.has(id))) {
    console.warn(`[ega.storage] import disabled every backend; re-enabling ${first}`);
    settings.disabledBackends = settings.disabledBackends.filter((id) => id !== first);
  }
  return settings;
}

/** A full backup, plus how many of its custom languages were not valid and stay out. */
type SettingsImport = Extract<ImportBundle, { kind: 'settings' }> & { skippedLanguages: number };

async function parseSettingsBundle(raw: Record<string, unknown>): Promise<SettingsImport> {
  const version = raw['version'];
  if (typeof version === 'number' && version > 2) throw new Error(TOO_NEW);
  const settings = raw['settings'];
  const rawLanguages = raw['customLanguages'];
  if ((version !== 1 && version !== 2) || !isPlainObject(settings) || !Array.isArray(rawLanguages))
    throw new Error(NOT_A_BACKUP);
  const ownIds = await ownLanguageIds();
  const customLanguages = importedLanguageRows(rawLanguages, ownIds);
  // A refused id reads as a language code: its prompt, defaults and glossary scopes would run for that code.
  const refused = new Set(
    rawLanguages.flatMap((c: unknown) =>
      isPlainObject(c) && typeof c['id'] === 'string' && refusedId(c['id'], ownIds)
        ? [c['id']]
        : [],
    ),
  );
  // A backup made before tasks existed has no rows: the import keeps the current ones, so check refs against those.
  const fileTasks = Array.isArray(raw['customTasks'])
    ? parseCustomTaskRows(raw['customTasks'], 'drop')
    : undefined;
  const customTasks = fileTasks ?? (await getCustomTasks());
  return {
    kind: 'settings',
    settings: validateSettings(
      withoutOverlongEditPatterns(settings),
      customLanguages,
      customTasks,
      refused,
    ),
    customLanguages,
    droppedCodeLikeCustoms: refused.size,
    skippedLanguages: rawLanguages.length - customLanguages.length - refused.size,
    ...(fileTasks ? { customTasks: fileTasks } : {}),
  };
}

/** Tells the export shapes apart by their root key and schema-checks the one it finds; throws before anything is written. */
export async function parseImportBundle(raw: unknown): Promise<ImportBundle> {
  if (isPlainObject(raw)) {
    if ('egaTaskPresets' in raw) {
      throw new Error('This is an old task-presets file. Import a full backup instead.');
    }
    if ('egaTasks' in raw) return parseTasksBundle(raw);
    if ('egaVarieties' in raw) return parseVarietiesBundle(raw);
    if ('egaGlossary' in raw) return parseGlossaryBundle(raw);
    if ('egaLanguage' in raw) return parseLanguageBundle(raw);
    if ('version' in raw) return parseSettingsBundle(raw);
  }
  throw new Error(NOT_A_BACKUP);
}

export type ImportStatus = { kind: 'ok' | 'err'; msg: string };

/** "a", "a and b", "a, b and c". */
function listOf(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

const PATTERN_DROPPED =
  ' Its detection pattern is not imported, because a shared pattern could claim text on every page. Add one in the Languages tab if you want Auto-detect to pick it.';

/** Null means the user backed out. */
async function confirmImport(
  bundle: ImportBundle,
  fileName: string,
): Promise<ImportOptions | null> {
  switch (bundle.kind) {
    case 'language': {
      const { label, examples } = bundle.language;
      const proceed = await confirmDialog(
        bundle.replaces === null
          ? {
              title: `Add "${label}"?`,
              body:
                `The file has the language "${label}" with ${count(examples.length, 'example')}. It is added next to your languages.` +
                (bundle.promptBroken ? ' Its prompt is broken and is left out.' : '') +
                (bundle.patternDropped ? PATTERN_DROPPED : ''),
              confirmLabel: 'Add',
            }
          : {
              title: `Replace "${bundle.replaces}"?`,
              body:
                `You already have this language. Importing replaces its label, hint and examples` +
                (bundle.prompt ? ' and its prompt.' : '. Its prompt stays.') +
                (bundle.promptBroken ? " The file's prompt is broken and is left out." : '') +
                (bundle.patternDropped
                  ? bundle.language.autoDetect
                    ? ' Your detection pattern stays.'
                    : " The file's detection pattern is not imported."
                  : '') +
                ' This cannot be undone.',
              confirmLabel: 'Replace',
            },
      );
      return proceed ? {} : null;
    }
    case 'glossary': {
      const proceed = await confirmDialog({
        title: 'Add glossary entries?',
        body:
          `The file has ${count(bundle.entries.length, 'entry', 'entries')} Ega can use. Ega adds the ones ` +
          `for terms you do not have yet, up to ${GLOSSARY_MAX} in total. Your entries stay as they are.`,
        confirmLabel: 'Add',
      });
      return proceed ? {} : null;
    }
    case 'varieties': {
      const replaced = [
        'custom languages',
        ...(bundle.varietyOverrides ? ['built-in edits'] : []),
        ...(bundle.disabledVarieties ? ['which languages are off'] : []),
        ...(bundle.presetTemplates ? ['language prompts'] : []),
      ];
      const proceed = await confirmDialog({
        title: 'Replace your custom languages and edits?',
        body:
          `The file contains ${count(bundle.fileCounts.customLanguages, 'custom language')}, ` +
          `${count(bundle.fileCounts.varietyOverrides, 'override')} and ` +
          `${count(bundle.fileCounts.presetTemplates, 'language prompt')}. Importing replaces your ${listOf(replaced)}.` +
          ' Glossary entries for a custom language the file does not have are removed too. This cannot be undone.',
        confirmLabel: 'Replace',
      });
      return proceed ? {} : null;
    }
    case 'tasks': {
      const proceed = await confirmDialog({
        title: 'Replace your tasks and task edits?',
        body:
          `The file contains ${count(bundle.fileCounts.customTasks, 'task')} and ` +
          `${count(bundle.fileCounts.taskOverrides, 'task edit')}. Importing replaces your own tasks, your edits to ` +
          (bundle.translatePrompt !== undefined
            ? 'built-in tasks (the Translate prompt too), and which tasks are on. This cannot be undone.'
            : 'built-in tasks, and which tasks are on. This cannot be undone.'),
        confirmLabel: 'Replace',
      });
      return proceed ? {} : null;
    }
    case 'settings': {
      const proceed = await confirmDialog({
        title: 'Import settings?',
        body: bundle.customTasks
          ? `This replaces your current settings, custom languages and tasks with the ones in ${fileName}.`
          : `This replaces your current settings and custom languages with the ones in ${fileName}. Your tasks stay, because the file has none.`,
        confirmLabel: 'Import',
        cancelLabel: 'Keep current settings',
      });
      if (!proceed) return null;
      // A keyless file (the default export) has no keys to use; using its keys would delete every current one.
      if (!BACKEND_API_KEY_FIELDS.some((k) => bundle.settings[k])) return { includeApiKeys: false };
      // Esc, the x and the secondary button all keep the current keys: the safe answer needs no click.
      const includeApiKeys = await confirmDialog({
        title: 'Use the API keys in this file?',
        body: 'Use them only if you made this file. Otherwise your current keys stay.',
        confirmLabel: "Use the file's keys",
        cancelLabel: 'Keep my keys',
      });
      return { includeApiKeys };
    }
  }
}

function summary(bundle: ImportBundle, merge: GlossaryMerge | undefined): string {
  switch (bundle.kind) {
    case 'language':
      return (
        `${bundle.replaces === null ? 'Added' : 'Replaced'} "${bundle.language.label}".` +
        (bundle.promptBroken ? ' Its prompt was broken and was left out.' : '') +
        (bundle.patternDropped && !bundle.language.autoDetect
          ? ' Its detection pattern was not imported.'
          : '')
      );
    case 'glossary': {
      const m = merge ?? { added: 0, alreadyThere: 0, overLimit: 0 };
      return (
        `Added ${count(m.added, 'entry', 'entries')}.` +
        (m.alreadyThere > 0 ? ` Skipped ${m.alreadyThere} for a term you already have.` : '') +
        (m.overLimit > 0 ? ` Skipped ${m.overLimit} over the ${GLOSSARY_MAX}-entry limit.` : '') +
        (bundle.skipped > 0
          ? ` Skipped ${count(bundle.skipped, 'broken or unknown entry', 'broken or unknown entries')}.`
          : '')
      );
    }
    case 'varieties': {
      const r = bundle.result;
      const drops = r.droppedDanglingOverrides.length + r.droppedUnknownDisabled.length;
      const imported = [
        count(r.customLanguagesAdded, 'custom language'),
        ...(bundle.varietyOverrides ? [count(r.varietyOverridesApplied, 'override')] : []),
        ...(bundle.disabledVarieties
          ? [count(r.disabledVarietiesApplied, 'disabled language')]
          : []),
        ...(bundle.presetTemplates ? [count(r.presetTemplatesApplied, 'language prompt')] : []),
      ];
      return (
        `Imported ${imported.join(', ')}.` +
        (drops > 0 ? ` Skipped ${count(drops, 'unknown entry', 'unknown entries')}.` : '') +
        (r.skippedBroken > 0
          ? ` Skipped ${count(r.skippedBroken, 'broken entry', 'broken entries')}.`
          : '') +
        (r.droppedCollidingCustoms > 0
          ? ` Dropped ${count(r.droppedCollidingCustoms, 'custom entry', 'custom entries')} with an id that is already taken.`
          : '') +
        (r.droppedCodeLikeCustoms > 0
          ? ` Dropped ${count(r.droppedCodeLikeCustoms, 'custom entry', 'custom entries')} whose id reads as a language code.`
          : '')
      );
    }
    case 'tasks': {
      const edits = Object.keys(bundle.taskOverrides).length + (bundle.translatePrompt ? 1 : 0);
      return (
        `Imported ${count(bundle.customTasks.length, 'task')} and ${count(edits, 'edit')}.` +
        (bundle.skipped > 0 ? ` Skipped ${bundle.skipped}.` : '')
      );
    }
    case 'settings': {
      const skipped = 'skippedLanguages' in bundle ? Number(bundle.skippedLanguages) : 0;
      return (
        (skipped > 0
          ? `Imported settings; ${count(skipped, 'language')} ${skipped === 1 ? 'was' : 'were'} skipped because ${skipped === 1 ? 'it was' : 'they were'} not valid.`
          : 'Imported all settings.') +
        (bundle.droppedCodeLikeCustoms > 0
          ? ` Dropped ${count(bundle.droppedCodeLikeCustoms, 'custom language')} whose id reads as a language code, with the settings that named it.`
          : '')
      );
    }
  }
}

const KIND_LABEL: Record<ImportBundle['kind'], string> = {
  settings: 'a full settings backup',
  varieties: 'a languages export',
  tasks: 'a tasks export',
  glossary: 'a glossary export',
  language: 'a one-language export',
};

/**
 * Reads, sniffs and schema-checks the file before the destructive confirm, so a bad pick never asks for one.
 * `expectedKind` narrows a scoped row to the kinds its label promises; omit it on the whole-backup row.
 * `askFirst` runs once the file is valid, before the import's own confirm; false cancels.
 * Null means canceled.
 */
export async function importBundleFile(
  file: File,
  expectedKind?: ImportBundle['kind'] | readonly ImportBundle['kind'][],
  askFirst?: (bundle: ImportBundle) => Promise<boolean>,
): Promise<ImportStatus | null> {
  let bundle: ImportBundle;
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error(NOT_A_BACKUP);
    }
    bundle = await parseImportBundle(parsed);
  } catch (e) {
    // Every parse error is a full sentence that says what to do; nothing was written.
    return { kind: 'err', msg: (e as Error).message };
  }
  const expected = expectedKind === undefined ? null : [expectedKind].flat();
  if (expected && !expected.includes(bundle.kind)) {
    return {
      kind: 'err',
      msg:
        `This file is ${KIND_LABEL[bundle.kind]}, not ${expected.map((k) => KIND_LABEL[k]).join(' or ')} — nothing was changed. ` +
        'Restore it from Advanced → Data → Backup and restore.',
    };
  }
  if (askFirst && !(await askFirst(bundle))) return null;
  const opts = await confirmImport(bundle, file.name);
  if (!opts) return null;
  try {
    const merge = await importBundle(bundle, opts);
    return { kind: 'ok', msg: summary(bundle, merge) };
  } catch (e) {
    return { kind: 'err', msg: `Import failed: ${(e as Error).message}` };
  }
}
