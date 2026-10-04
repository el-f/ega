import { STORAGE_KEYS } from '../constants';
import type {
  CustomLanguage,
  PromptTemplate,
  Settings,
  VarietyEdit,
  VarietiesBundle,
  VarietiesImportResult,
} from '../types';
import { BACKEND_API_KEY_FIELDS } from '../provider-ids';
import {
  CURRENT_TEMPLATE_VERSION,
  DEFAULT_PROMPT_TEMPLATE,
  GLOSSARY_MAX,
  isPromptTemplateCustomised,
  type GlossaryBundle,
  type LanguageBundle,
  type CustomTask,
  type LanguagePrompt,
  type TasksBundle,
} from '../settings-schema';
import { ALL_TASKS } from '../task-prompts';
import { CUSTOM_LANGUAGES_MAX } from './sanitise';
import { withEncodedMenuIds } from '../context-menu-ids';
import {
  getCustomLanguages,
  getCustomTasks,
  getSettings,
  replaceSettings,
  withCustomsLock,
  withCustomTasksLock,
  withSettingsLock,
  writeLocal,
} from '../storage';

/** The whole snippet map, when an exported prompt still holds a @@ref: refs stay only while writing them out would pass TEMPLATE_MAX. */
function snippetsFor(
  s: Settings,
  prompts: readonly { system?: string; user?: string }[],
): { snippets?: Record<string, string> } {
  const kept = s.advanced.snippets;
  if (Object.keys(kept).length === 0) return {};
  const refers = prompts.some((p) => `${p.system ?? ''}${p.user ?? ''}`.includes('@@'));
  return refers ? { snippets: kept } : {};
}

// Only the options page imports this, so the export and import code stays out of the popup and side-panel chunks.
export async function exportVarieties(): Promise<VarietiesBundle> {
  const [settings, customLanguages] = await Promise.all([getSettings(), getCustomLanguages()]);
  return {
    egaVarieties: {
      v: 2,
      exportedAt: new Date().toISOString(),
      customLanguages,
      varietyOverrides: settings.varietyOverrides,
      disabledVarieties: settings.disabledVarieties,
      presetTemplates: settings.advanced.perPresetTemplates,
      ...snippetsFor(settings, Object.values(settings.advanced.perPresetTemplates)),
    },
  };
}

type VarietiesPlan = {
  kind: 'varieties';
  customLanguages: CustomLanguage[];
  /** Absent when the file leaves the map out or breaks it: the current edits stay. */
  varietyOverrides?: Record<string, VarietyEdit>;
  /** Absent when the file leaves the list out or breaks it: the current off list stays. */
  disabledVarieties?: string[];
  /** Absent for a version 1 file, or a broken map: the current language prompts stay. */
  presetTemplates?: Record<string, LanguagePrompt>;
  /** Merged into the current snippets, so a prompt's @@refs still resolve. */
  snippets?: Record<string, string>;
  /** Raw counts from the file, for the confirm copy. */
  fileCounts: { customLanguages: number; varietyOverrides: number; presetTemplates: number };
  result: VarietiesImportResult;
};

type SettingsPlan = {
  kind: 'settings';
  settings: Settings;
  customLanguages: CustomLanguage[];
  /** Absent in a backup made before tasks existed; the import then keeps the current rows. */
  customTasks?: CustomTask[];
  /** File rows refused for an id that reads as a language code; their prompts and references are dropped too. */
  droppedCodeLikeCustoms: number;
};

type TasksPlan = {
  kind: 'tasks';
  customTasks: CustomTask[];
  taskOverrides: Settings['taskOverrides'];
  disabledTasks: string[];
  /** Absent for a version 1 file: the current Translate prompt stays. Null resets it to the shipped one. */
  translatePrompt?: { template: PromptTemplate; version: number } | null;
  /** Merged into the current snippets, so a prompt's @@refs still resolve. */
  snippets?: Record<string, string>;
  /** Raw counts from the file, for the confirm copy. */
  fileCounts: { customTasks: number; taskOverrides: number };
  skipped: number;
};

type GlossaryPlan = {
  kind: 'glossary';
  /** Checked entries whose scopes name a language this install has. */
  entries: Settings['glossary'];
  /** Entries that failed the schema or name a language this install does not have. */
  skipped: number;
};

type LanguagePlan = {
  kind: 'language';
  language: CustomLanguage;
  /** Absent when the file has no prompt of its own: the current prompt for this id, if any, stays. */
  prompt?: LanguagePrompt;
  /** Merged into the current snippets, so the prompt's @@refs still resolve. */
  snippets?: Record<string, string>;
  /** The label of the custom language with the same id that this import replaces; null when it adds one. */
  replaces: string | null;
  /** The file had a prompt that failed the schema, so it was left out. */
  promptBroken: boolean;
  /** The file had a detection pattern; a shared one is never imported. */
  patternDropped: boolean;
};

/** A schema-checked bundle with its writes already decided. The UI confirms on this, then `importBundle` writes it. */
export type ImportBundle = VarietiesPlan | SettingsPlan | TasksPlan | GlossaryPlan | LanguagePlan;

/** What a glossary import did; the other imports replace, so they report from the plan. */
export interface GlossaryMerge {
  added: number;
  /** Entries for a term the glossary already has in an overlapping scope: the current one stays. */
  alreadyThere: number;
  overLimit: number;
}

type GlossaryEntry = Settings['glossary'][number];

// A missing scope is every language, so it meets any other.
const scopesMeet = (x: string | undefined, y: string | undefined): boolean =>
  x === undefined || y === undefined || x === y;

/** The terms match the same text, unless both are case-sensitive and differ in case. */
function sameTerm(a: GlossaryEntry, b: GlossaryEntry): boolean {
  const ta = a.term.normalize('NFC');
  const tb = b.term.normalize('NFC');
  return a.caseSensitive && b.caseSensitive ? ta === tb : ta.toLowerCase() === tb.toLowerCase();
}

/** True when one request can use both: the same term in overlapping scopes. */
function overlaps(a: GlossaryEntry, b: GlossaryEntry): boolean {
  return (
    sameTerm(a, b) &&
    scopesMeet(a.sourceLang, b.sourceLang) &&
    scopesMeet(a.targetLang, b.targetLang)
  );
}

/** Adds the incoming entries the glossary does not have yet, in file order, up to the cap. A file may hold one term in two scopes, as the editor allows, so only an exact repeat inside the file is skipped. */
function mergeGlossary(
  cur: readonly GlossaryEntry[],
  incoming: readonly GlossaryEntry[],
): GlossaryMerge & { next: GlossaryEntry[] } {
  const next = [...cur];
  let alreadyThere = 0;
  let overLimit = 0;
  for (const e of incoming) {
    const repeat = next
      .slice(cur.length)
      .some(
        (x) => sameTerm(x, e) && x.sourceLang === e.sourceLang && x.targetLang === e.targetLang,
      );
    if (repeat || cur.some((x) => overlaps(x, e))) alreadyThere++;
    else if (next.length >= GLOSSARY_MAX) overLimit++;
    else next.push(e);
  }
  return { next, added: next.length - cur.length, alreadyThere, overLimit };
}

/** One custom language with its own prompt, for sharing; rejects 'language-gone' when no custom language has the id. */
export async function exportLanguage(id: string): Promise<LanguageBundle> {
  const [settings, customs] = await Promise.all([getSettings(), getCustomLanguages()]);
  const language = customs.find((c) => c.id === id);
  if (!language) throw new Error('language-gone');
  const prompt = Object.hasOwn(settings.advanced.perPresetTemplates, id)
    ? settings.advanced.perPresetTemplates[id]
    : undefined;
  return {
    egaLanguage: {
      v: 1,
      exportedAt: new Date().toISOString(),
      language,
      ...(prompt ? { prompt, ...snippetsFor(settings, [prompt]) } : {}),
    },
  };
}

export async function exportGlossary(): Promise<GlossaryBundle> {
  const settings = await getSettings();
  return {
    egaGlossary: { v: 1, exportedAt: new Date().toISOString(), entries: settings.glossary },
  };
}

interface ExportBundle {
  /** 2 when the file carries task data, so a build from before tasks refuses it instead of widening rules. */
  version: 1 | 2;
  exportedAt: string;
  settings: Settings;
  customLanguages: CustomLanguage[];
  customTasks: CustomTask[];
}

export async function exportTasks(): Promise<TasksBundle> {
  const [settings, customTasks] = await Promise.all([getSettings(), getCustomTasks()]);
  return {
    egaTasks: {
      v: 2,
      exportedAt: new Date().toISOString(),
      customTasks,
      taskOverrides: settings.taskOverrides,
      disabledTasks: settings.disabledTasks,
      // The Tasks tab shows an edited Translate prompt as a Translate edit, so the tasks file carries it.
      translatePrompt: isPromptTemplateCustomised(settings.advanced.promptTemplate)
        ? {
            ...settings.advanced.promptTemplate,
            templateVersion: settings.advanced.templateVersion,
          }
        : null,
      ...snippetsFor(settings, [
        ...Object.values(settings.taskOverrides),
        ...customTasks,
        settings.advanced.promptTemplate,
      ]),
    },
  };
}

/** A task id an older build cannot read appears anywhere in the settings. */
function namesTaskData(s: Settings, customTasks: readonly CustomTask[]): boolean {
  const builtIn = (id: string): boolean => (ALL_TASKS as readonly string[]).includes(id);
  return (
    customTasks.length > 0 ||
    Object.keys(s.taskOverrides).length > 0 ||
    !builtIn(s.defaultTask) ||
    s.disabledTasks.some((id) => !builtIn(id)) ||
    s.advanced.rules.some((r) => r.scope.tasks.some((id) => !builtIn(id))) ||
    s.contextMenuItems.some((i) => i.kind === 'task' && !builtIn(i.task))
  );
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
  const customTasks = await getCustomTasks();
  return {
    version: namesTaskData(settings, customTasks) ? 2 : 1,
    exportedAt: new Date().toISOString(),
    settings: safeSettings,
    customLanguages: await getCustomLanguages(),
    customTasks,
  };
}

export interface ImportOptions {
  /** Default false — strip bundle keys so a shared file can't replace live ones. */
  includeApiKeys?: boolean;
}

/** Writes a confirmed plan. Only a glossary import reports back, since it merges into the current list. */
export async function importBundle(
  bundle: ImportBundle,
  opts: ImportOptions = {},
): Promise<GlossaryMerge | undefined> {
  switch (bundle.kind) {
    case 'language': {
      // Adds or replaces one row and leaves the rest; both keys in one set, under the locks in the settings-case order.
      await withSettingsLock(() =>
        withCustomsLock(async () => {
          const [cur, customs] = await Promise.all([getSettings(), getCustomLanguages()]);
          const { language, prompt } = bundle;
          const idx = customs.findIndex((c) => c.id === language.id);
          if (idx === -1 && customs.length >= CUSTOM_LANGUAGES_MAX) {
            throw new Error(
              `Custom language limit is ${CUSTOM_LANGUAGES_MAX} — delete one before adding another.`,
            );
          }
          const list =
            idx === -1 ? [...customs, language] : customs.map((c, i) => (i === idx ? language : c));
          const next: Settings = prompt
            ? {
                ...cur,
                advanced: {
                  ...cur.advanced,
                  perPresetTemplates: { ...cur.advanced.perPresetTemplates, [language.id]: prompt },
                  snippets: { ...cur.advanced.snippets, ...bundle.snippets },
                },
              }
            : cur;
          await chrome.storage.local.set({
            [STORAGE_KEYS.settings]: next,
            [STORAGE_KEYS.customLanguages]: list,
          });
        }),
      );
      return undefined;
    }
    case 'glossary': {
      let merge: GlossaryMerge = { added: 0, alreadyThere: 0, overLimit: 0 };
      await replaceSettings((cur) => {
        const { next, ...counts } = mergeGlossary(cur.glossary, bundle.entries);
        merge = counts;
        return { ...cur, glossary: next };
      });
      return merge;
    }
    case 'varieties': {
      // Both keys in one set under both locks, in the order the settings case takes them, so a failed write changes neither.
      await withSettingsLock(() =>
        withCustomsLock(async () => {
          const [cur, current] = await Promise.all([getSettings(), getCustomLanguages()]);
          // The import replaces the custom languages, so a prompt for one it drops goes too, as deleting it does.
          const kept = new Set(bundle.customLanguages.map((c) => c.id));
          const dropped = new Set<string>(current.map((c) => c.id).filter((id) => !kept.has(id)));
          // Replaces rather than merges — a merge keeps overrides the bundle dropped.
          const next: Settings = {
            ...cur,
            disabledVarieties: bundle.disabledVarieties ?? cur.disabledVarieties,
            varietyOverrides: bundle.varietyOverrides ?? cur.varietyOverrides,
            advanced: {
              ...cur.advanced,
              perPresetTemplates: Object.fromEntries(
                Object.entries(bundle.presetTemplates ?? cur.advanced.perPresetTemplates).filter(
                  ([id]) => !dropped.has(id),
                ),
              ),
              snippets: { ...cur.advanced.snippets, ...bundle.snippets },
            },
          };
          await chrome.storage.local.set({
            [STORAGE_KEYS.settings]: next,
            [STORAGE_KEYS.customLanguages]: bundle.customLanguages,
          });
        }),
      );
      return undefined;
    }
    case 'tasks': {
      // Rows first, so the settings never point at rows that are not there yet; the read path covers a failed second write.
      await withCustomTasksLock(() => writeLocal(STORAGE_KEYS.customTasks, bundle.customTasks));
      const tp = bundle.translatePrompt;
      await replaceSettings((cur) => {
        // A new prompt has not been acknowledged, so the version banner judges it afresh.
        const { templateVersionAcknowledged: _ack, ...advanced } = cur.advanced;
        void _ack;
        return {
          ...cur,
          taskOverrides: bundle.taskOverrides,
          disabledTasks: bundle.disabledTasks,
          advanced: {
            ...(tp !== undefined
              ? {
                  ...advanced,
                  promptTemplate: tp ? { ...tp.template } : { ...DEFAULT_PROMPT_TEMPLATE },
                  templateVersion: tp ? tp.version : CURRENT_TEMPLATE_VERSION,
                }
              : cur.advanced),
            snippets: { ...cur.advanced.snippets, ...bundle.snippets },
          },
        };
      });
      return undefined;
    }
    case 'settings': {
      // Nested acquisition is safe here, because the three locks guard disjoint storage keys.
      await withSettingsLock(async () => {
        await withCustomsLock(() =>
          withCustomTasksLock(async () => {
            // Copy first: the loop below writes and deletes fields the caller may still hold a reference to.
            const settings = { ...bundle.settings };
            // A click decides the side panel from the id alone, so the stored id must encode the surface.
            settings.contextMenuItems = withEncodedMenuIds(settings.contextMenuItems);
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
              ...(bundle.customTasks ? { [STORAGE_KEYS.customTasks]: bundle.customTasks } : {}),
            });
          }),
        );
      });
      return undefined;
    }
  }
}
