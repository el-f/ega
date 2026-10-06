/** Turns a raw stored row into a valid `Settings`. Pure — no chrome.*, no locks. */
import { DEFAULT_MODEL, DEFAULT_SETTINGS } from '../settings-defaults';
import type {
  BackendId,
  CustomLanguage,
  LangSelection,
  Settings,
  SitePref,
  VarietyEdit,
} from '../types';
import { asBackendIdUnsafe, asLangSelection, LANG_ID_PATTERN } from '../brands';
import { apiKeyField, BACKEND_IDS, type CloudProviderId } from '../provider-ids';
import { BUILT_IN_PRESETS } from '../presets';
import { hasRiskyRepeat } from '../regex-risk';
import { clampToSchema, isPlainObject } from '../settings-clamp';
import * as valibot from 'valibot';
import {
  CURRENT_TEMPLATE_VERSION,
  customLanguageSchema,
  customTaskSchema,
  DEFAULT_PROMPT_TEMPLATE,
  isPromptTemplateCustomised,
  PREVIOUS_PROMPT_TEMPLATE,
  type LanguagePrompt,
  OPTIONAL_SETTINGS_KEYS,
  parseStoredSettings,
  type CustomTask,
  type SettingsFromSchema,
  type TaskEdit,
  UNKNOWN_TASK_ID,
} from '../settings-schema';
import { ALL_TASKS, buildTaskTemplate, type Task } from '../task-prompts';
import { BUILT_IN_TASK_SWITCHES, hasOwnPrompt } from '../task-view';

/** Matches LangPresetIdSchema's cap — a custom variety id is a 36-char UUID. */
const LANG_SELECTION_MAX = 64;

// Tells "pass through as a language code" from "must match a variety id" — the schema's own pattern, so `zh-Hant-TW` survives a read.
function isIsoLikeLang(s: string): boolean {
  return LANG_ID_PATTERN.test(s);
}

function warnDropped(field: string, value: unknown): void {
  console.warn(`[ega.storage] dropping dangling reference: ${field} = ${JSON.stringify(value)}`);
}

/** A built-in override keeps only what the user changed: a copy of a shipped field would shadow every later fix to the preset. A label is dropped too: a built-in keeps its shipped label. */
export function withoutShippedFields(
  id: string,
  edit: Record<string, unknown>,
): Record<string, unknown> {
  const base = BUILT_IN_PRESETS.find((p) => p.id === id) as Record<string, unknown> | undefined;
  if (!base) return edit;
  return Object.fromEntries(
    Object.entries(edit).filter(
      ([k, v]) => k !== 'label' && JSON.stringify(v) !== JSON.stringify(base[k]),
    ),
  );
}

// A nested repeat never returns on a long selection, and a long optional run hangs the compile: dropped where read, never run.
function hasNestedDetectRegex(autoDetect: unknown): boolean {
  return (
    isPlainObject(autoDetect) &&
    typeof autoDetect['regex'] === 'string' &&
    hasRiskyRepeat(autoDetect['regex'])
  );
}

function warnNestedRegex(field: string, autoDetect: unknown): void {
  console.warn(
    `[ega.storage] dropping a detection pattern that can freeze a page: ${field} = ${JSON.stringify(autoDetect)}`,
  );
}

interface RefValidators {
  isBackendId: (id: string) => boolean;
  isVarietyId: (id: string) => boolean;
  /** A custom id an import refused: it reads as a language code, so a reference to it would retarget that code. */
  isGoneLang: (id: string) => boolean;
}

const BACKEND_ID_SET: ReadonlySet<string> = new Set<string>(BACKEND_IDS);

/** Null customs are unreadable rows: any id may name one, so none is dropped. */
function buildRefValidators(
  customs: readonly CustomLanguage[] | null,
  goneLangIds: ReadonlySet<string> = new Set(),
): RefValidators {
  const varietyIdSet = new Set<string>([
    ...BUILT_IN_PRESETS.map((p) => p.id),
    ...(customs ?? []).map((c) => c.id),
  ]);
  return {
    isBackendId: (id) => BACKEND_ID_SET.has(id),
    isVarietyId: (id) => customs === null || varietyIdSet.has(id),
    isGoneLang: (id) => goneLangIds.has(id),
  };
}

/** A language reference that still names something: 'auto', a language code, or a known language id. */
function isKnownLang(v: RefValidators, id: string): boolean {
  return !v.isGoneLang(id) && (id === 'auto' || isIsoLikeLang(id) || v.isVarietyId(id));
}

function sanitiseSitePref(
  pref: Record<string, unknown>,
  origin: string,
  v: RefValidators,
): SitePref {
  const dir = pref['lastDirection'];
  let validDir: { source: LangSelection; target: LangSelection } | null = null;
  if (
    isPlainObject(dir) &&
    typeof dir['source'] === 'string' &&
    typeof dir['target'] === 'string' &&
    dir['source'].length > 0 &&
    dir['source'].length <= LANG_SELECTION_MAX &&
    dir['target'].length > 0 &&
    dir['target'].length <= LANG_SELECTION_MAX
  ) {
    const src = dir['source'];
    const tgt = dir['target'];
    if (isKnownLang(v, src) && isKnownLang(v, tgt)) {
      validDir = { source: asLangSelection(src), target: asLangSelection(tgt) };
    } else {
      warnDropped(`sitePrefs[${origin}].lastDirection`, dir);
    }
  }
  let defaultLang: LangSelection | undefined;
  const rawDefaultLang = pref['defaultLang'];
  if (typeof rawDefaultLang === 'string' && rawDefaultLang.length > 0) {
    if (isKnownLang(v, rawDefaultLang)) {
      defaultLang = asLangSelection(rawDefaultLang);
    } else {
      warnDropped(`sitePrefs[${origin}].defaultLang`, rawDefaultLang);
    }
  }
  return {
    disabled: pref['disabled'] === true,
    ...(defaultLang !== undefined ? { defaultLang } : {}),
    ...(validDir ? { lastDirection: validDir } : {}),
  };
}

type ParsedSettings = SettingsFromSchema;

interface FilteredRefs {
  disabledVarieties: string[];
  varietyOverrides: Record<string, VarietyEdit>;
  disabledBackends: BackendId[];
}

function filterDanglingRefs(parsed: ParsedSettings, validators: RefValidators): FilteredRefs {
  const disabledVarieties = parsed.disabledVarieties.filter((id) => {
    if (validators.isVarietyId(id)) return true;
    warnDropped('disabledVarieties[]', id);
    return false;
  });
  const varietyOverrides: Record<string, VarietyEdit> = {};
  for (const [k, v] of Object.entries(parsed.varietyOverrides)) {
    if (!validators.isVarietyId(k)) {
      warnDropped(`varietyOverrides[${k}]`, k);
      continue;
    }
    const edit: Record<string, unknown> = { ...v };
    for (const ek of Object.keys(edit)) {
      if (edit[ek] === undefined) delete edit[ek];
    }
    if (hasNestedDetectRegex(edit['autoDetect'])) {
      warnNestedRegex(`varietyOverrides[${k}].autoDetect`, edit['autoDetect']);
      delete edit['autoDetect'];
    }
    const kept = withoutShippedFields(k, edit);
    if (Object.keys(kept).length > 0) varietyOverrides[k] = kept as VarietyEdit;
  }
  const disabledBackends = parsed.disabledBackends.filter((id) => {
    if (validators.isBackendId(id)) return true;
    warnDropped('disabledBackends[]', id);
    return false;
  });
  return { disabledVarieties, varietyOverrides, disabledBackends };
}

/** An entry scoped to a gone language can never apply again, and dropping only its scope would widen it to every request. */
function filterGlossary(entries: Settings['glossary'], v: RefValidators): Settings['glossary'] {
  return entries.filter((e) => {
    const gone = [e.sourceLang, e.targetLang].find((id) => id !== undefined && !isKnownLang(v, id));
    if (gone === undefined) return true;
    warnDropped('glossary[] scope', gone);
    return false;
  });
}

/** The entries whose scopes all name a language this install has, as the read path keeps them. */
export function withKnownGlossaryScopes(
  entries: Settings['glossary'],
  customs: readonly CustomLanguage[] | null,
): Settings['glossary'] {
  return filterGlossary(entries, buildRefValidators(customs));
}

/** A right-click item whose target is gone falls back to the default target, as picking Auto in its editor does. */
function filterMenuTargets(parsed: ParsedSettings, v: RefValidators): Settings['contextMenuItems'] {
  return parsed.contextMenuItems.map((item) => {
    if (item.kind !== 'task' || item.targetLang === undefined || isKnownLang(v, item.targetLang))
      return item;
    warnDropped(`contextMenuItems[${item.id}].targetLang`, item.targetLang);
    const { targetLang: _gone, ...rest } = item;
    return rest;
  });
}

/** A pre-v4 image row stored no surface and followed the global image surface. The options page no
 *  longer shows that global, so such a row takes its stored value here: the place the user had before. */
function withLegacyImageSurface(
  items: Settings['contextMenuItems'],
  stored: Record<string, unknown>,
): Settings['contextMenuItems'] {
  const global = stored['imageTranslateSurface'];
  const raw = stored['contextMenuItems'];
  if ((global !== 'tooltip' && global !== 'sidepanel') || !Array.isArray(raw)) return items;
  const unset = new Set(
    raw
      .filter((r) => isPlainObject(r) && r['kind'] === 'image-task' && !('surface' in r))
      .map((r) => (r as Record<string, unknown>)['id']),
  );
  if (unset.size === 0) return items;
  return items.map((i) =>
    i.kind === 'image-task' && unset.has(i.id) ? { ...i, surface: global } : i,
  );
}

// Shared by the read and the write path; the shipped tail makes a newly registered provider appear without a migration.
export function normaliseBackendOrder(ids: readonly unknown[]): BackendId[] {
  const seen = new Set<string>();
  const out: BackendId[] = [];
  const push = (id: unknown): void => {
    if (typeof id !== 'string' || !BACKEND_ID_SET.has(id) || seen.has(id)) return;
    seen.add(id);
    out.push(asBackendIdUnsafe(id));
  };
  for (const id of ids) push(id);
  for (const id of DEFAULT_SETTINGS.backendOrder) push(id);
  return out;
}

// Empty or missing lands on DEFAULT via normaliseBackendOrder's shipped tail.
function buildBackendOrder(stored: Record<string, unknown>): BackendId[] {
  const rawOrder = stored['backendOrder'];
  if (Array.isArray(rawOrder)) {
    for (const v of rawOrder as unknown[]) {
      if (typeof v !== 'string') warnDropped('backendOrder[]', v);
    }
    return normaliseBackendOrder(rawOrder as unknown[]);
  }
  if (rawOrder !== undefined) warnDropped('backendOrder', rawOrder);
  return normaliseBackendOrder([]);
}

/** A backend the shipped tail adds to an older stored order starts as shipped: an opt-in one stays off until the user turns it on. */
function withNewBackendsOff(stored: Record<string, unknown>, disabled: BackendId[]): BackendId[] {
  const rawOrder = stored['backendOrder'];
  if (!Array.isArray(rawOrder)) return disabled;
  const seen = new Set<unknown>([...(rawOrder as unknown[]), ...disabled]);
  const added = DEFAULT_SETTINGS.disabledBackends.filter((id) => !seen.has(id));
  return added.length > 0 ? [...disabled, ...added] : disabled;
}

function resolveLangDefaults(
  parsed: ParsedSettings,
  validators: RefValidators,
): { defaultLang: LangSelection; defaultTargetLang: LangSelection } {
  const checkLang = (raw: LangSelection, field: string, fallback: LangSelection): LangSelection => {
    // A stored target of 'auto' would ask the model to translate into the source language.
    if (raw === 'auto') return field === 'defaultLang' ? raw : fallback;
    if (isKnownLang(validators, raw)) return raw;
    warnDropped(field, raw);
    return fallback;
  };
  const defaultLang =
    parsed.defaultLang.length > 0
      ? checkLang(parsed.defaultLang, 'defaultLang', 'auto')
      : DEFAULT_SETTINGS.defaultLang;
  const defaultTargetLang =
    parsed.defaultTargetLang.length > 0
      ? checkLang(parsed.defaultTargetLang, 'defaultTargetLang', DEFAULT_SETTINGS.defaultTargetLang)
      : DEFAULT_SETTINGS.defaultTargetLang;
  return { defaultLang, defaultTargetLang };
}

const ORIGIN_SHAPED = /^[a-z][a-z0-9+.-]*:\/\//i;

/** A bare-host key has no scheme, so it repairs into both http and https origins rather than guessing one, which could leave a site the user turned off still running Ega. */
function canonicalSiteKeys(key: string): string[] {
  // `file://x` has an empty host; parseToggleOrigin writes 'null' for it today.
  if (key === '') return ['null'];
  if (key === 'null' || ORIGIN_SHAPED.test(key)) return [key];
  try {
    const u = new URL(`https://${key}`);
    return u.host === key.toLowerCase() ? [u.origin, `http://${u.host}`] : [key];
  } catch {
    return [key];
  }
}

function sanitiseSitePrefsMap(
  parsed: ParsedSettings,
  validators: RefValidators,
): Settings['sitePrefs'] {
  const sitePrefs: Settings['sitePrefs'] = {};
  for (const [key, pref] of Object.entries(parsed.sitePrefs)) {
    for (const origin of canonicalSiteKeys(key)) {
      const clean = sanitiseSitePref(pref as Record<string, unknown>, origin, validators);
      const existing = sitePrefs[origin];
      if (!existing) {
        sitePrefs[origin] = clean;
        continue;
      }
      // Both key shapes for one site: the origin row owns the fields, an off switch from either wins.
      const base = key === origin ? clean : existing;
      const disabled = existing.disabled === true || clean.disabled === true;
      sitePrefs[origin] = { ...base, disabled };
    }
  }
  return sitePrefs;
}

/** A task edit keeps only what differs from the shipped task, so a later fix to a field the user never touched still reaches them. Each prompt half is compared on its own. */
export function withoutShippedTaskFields(id: Task, edit: TaskEdit): TaskEdit {
  const shipped = BUILT_IN_TASK_SWITCHES[id];
  const out: TaskEdit = {};
  if (hasOwnPrompt(id)) {
    const prompt = buildTaskTemplate(id);
    if (edit.system !== undefined && edit.system !== prompt.system) out.system = edit.system;
    if (edit.user !== undefined && edit.user !== prompt.user) out.user = edit.user;
  }
  if (edit.pageContext !== undefined && edit.pageContext !== shipped.pageContext) {
    out.pageContext = edit.pageContext;
  }
  if (edit.glossary !== undefined && edit.glossary !== shipped.glossary)
    out.glossary = edit.glossary;
  // A picked level stays: the shipped one is only a floor under the global Effort, so the same value can run differently.
  if (edit.effort !== undefined) out.effort = edit.effort;
  return out;
}

/** A language prompt keeps only the halves it changes: one equal to a shipped default (a stored copy, never a pick) or to the given Translate prompt is dropped, so it follows Translate. */
export function withoutInheritedHalves(
  tpl: LanguagePrompt,
  global?: { system: string; user: string },
): LanguagePrompt {
  const out: LanguagePrompt = {};
  const inherited = [
    DEFAULT_PROMPT_TEMPLATE,
    PREVIOUS_PROMPT_TEMPLATE,
    ...(global ? [global] : []),
  ];
  for (const half of ['system', 'user'] as const) {
    const text = tpl[half];
    if (text === undefined || inherited.some((t) => t[half] === text)) continue;
    out[half] = text;
  }
  return out;
}

/** On read only shipped-default copies go: a half equal to today's Translate prompt may be one the user wrote, and Translate can change later. */
function sparseLanguagePrompts(
  advanced: Settings['advanced'],
  v: RefValidators,
): Settings['advanced'] {
  const out: Settings['advanced']['perPresetTemplates'] = {};
  for (const [id, tpl] of Object.entries(advanced.perPresetTemplates)) {
    if (v.isGoneLang(id)) {
      warnDropped('perPresetTemplates', id);
      continue;
    }
    const own = withoutInheritedHalves(tpl);
    if (Object.keys(own).length > 0) out[id] = own;
  }
  return { ...advanced, perPresetTemplates: out };
}

function sanitiseTaskOverrides(parsed: ParsedSettings): Settings['taskOverrides'] {
  const out: Settings['taskOverrides'] = {};
  for (const t of ALL_TASKS) {
    const edit = parsed.taskOverrides[t];
    if (!edit) continue;
    const kept = withoutShippedTaskFields(t, edit);
    if (Object.keys(kept).length > 0) out[t] = kept;
  }
  return out;
}

/** Rewrites only ids that are gone for good, since every writer saves this output; null rows are unreadable, so no custom id counts as gone. A disabled default stays: readers run it as Translate while it is off. Rule scopes are never touched, so a rule never widens. */
function resolveTaskRefs(
  parsed: ParsedSettings,
  customTasks: readonly CustomTask[] | null,
): Pick<Settings, 'defaultTask' | 'disabledTasks'> {
  const ids = new Set<string>([...ALL_TASKS, ...(customTasks ?? []).map((c) => c.id)]);
  const known = (id: string): boolean => customTasks === null || ids.has(id);
  let defaultTask = parsed.defaultTask;
  if (!known(defaultTask)) {
    warnDropped('defaultTask', defaultTask);
    defaultTask = 'translate';
  }
  const disabledTasks = [...new Set(parsed.disabledTasks)].filter((id) => {
    if (id !== 'translate' && known(id)) return true;
    warnDropped('disabledTasks[]', id);
    return false;
  });
  return { defaultTask, disabledTasks };
}

function stripOptionalUndefs(s: Settings): Settings {
  const obj = s as unknown as Record<string, unknown>;
  for (const k of OPTIONAL_SETTINGS_KEYS) {
    if (obj[k] === undefined) delete obj[k];
  }
  return s;
}

/** Ids that fail on the provider today; `to` defaults to the current default. A settings save writes every model slot, so a stored one is usually a default nobody picked. `keyless`: rewrite only while no key is saved, since an older account keeps access. */
const STALE_MODEL_IDS: ReadonlyArray<{
  backend: CloudProviderId;
  id: string;
  to?: string;
  keyless?: true;
}> = [
  { backend: 'gemini', id: 'gemini-2.5-flash', keyless: true },
  { backend: 'groq', id: 'llama-3.3-70b-versatile' },
  { backend: 'groq', id: 'llama-3.1-8b-instant', to: 'openai/gpt-oss-20b' },
  { backend: 'deepseek', id: 'deepseek-chat' },
  { backend: 'deepseek', id: 'deepseek-reasoner' },
  { backend: 'fireworks', id: 'accounts/fireworks/models/llama-v3p3-70b-instruct' },
];

function withoutStaleModels(s: Settings, apiKeysKnown: boolean): Settings['model'] {
  let model = s.model;
  for (const { backend, id, to, keyless } of STALE_MODEL_IDS) {
    if (model[backend] !== id || (keyless && (!apiKeysKnown || s[apiKeyField(backend)]))) continue;
    model = { ...model, [backend]: to ?? DEFAULT_MODEL[backend] };
  }
  return model;
}

/** `apiKeysKnown: false` is for a row whose key fields are not final yet (an import may swap in the current keys), so key-dependent rewrites wait for the read path. `customTasks` are the rows a task reference may name. Null rows are unreadable: references to them are kept. */
export function sanitiseStoredSettings(
  stored: Record<string, unknown>,
  customs: readonly CustomLanguage[] | null,
  {
    apiKeysKnown = true,
    customTasks = [],
    goneLangIds,
  }: {
    apiKeysKnown?: boolean;
    customTasks?: readonly CustomTask[] | null;
    goneLangIds?: ReadonlySet<string>;
  } = {},
): Settings {
  const parsed = parseStoredSettings(stored, { defaults: DEFAULT_SETTINGS });
  const validators = buildRefValidators(customs, goneLangIds);
  const refs = filterDanglingRefs(parsed, validators);
  const backendOrder = buildBackendOrder(stored);
  // DEFAULT_SETTINGS spreads first, or an optional field with no schema default breaks the empty-storage round-trip.
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...(parsed as Settings),
    ...resolveLangDefaults(parsed, validators),
    sitePrefs: sanitiseSitePrefsMap(parsed, validators),
    glossary: filterGlossary(parsed.glossary, validators),
    contextMenuItems: withLegacyImageSurface(filterMenuTargets(parsed, validators), stored),
    disabledVarieties: refs.disabledVarieties,
    varietyOverrides: refs.varietyOverrides,
    backendOrder,
    disabledBackends: withNewBackendsOff(stored, refs.disabledBackends),
    taskOverrides: sanitiseTaskOverrides(parsed),
    ...resolveTaskRefs(parsed, customTasks),
  };
  merged.model = withoutStaleModels(merged, apiKeysKnown);
  // A settings save writes the whole object, so an untouched template is a stored copy of an old default.
  if (!isPromptTemplateCustomised(merged.advanced.promptTemplate)) {
    merged.advanced = {
      ...merged.advanced,
      promptTemplate: { ...DEFAULT_PROMPT_TEMPLATE },
      templateVersion: CURRENT_TEMPLATE_VERSION,
    };
  }
  merged.advanced = sparseLanguagePrompts(merged.advanced, validators);
  return stripOptionalUndefs(merged);
}

/** Same ceiling the varieties bundle schema enforces; one entry can reach ~50 KB. */
export const CUSTOM_LANGUAGES_MAX = 200;

/** Per-row upsertCustomLanguage schema: a bad bundle row is dropped, a bad stored row with id and label is kept, since every writer writes this list back and dropping it deletes it for good. */
export function parseCustomLanguageRows(
  raw: readonly unknown[],
  onInvalid: 'drop' | 'keep',
): CustomLanguage[] {
  const out: CustomLanguage[] = [];
  const taken = new Set<string>(BUILT_IN_PRESETS.map((p) => p.id));
  let kept = 0;
  for (const c of raw) {
    if (out.length >= CUSTOM_LANGUAGES_MAX) break;
    if (!isPlainObject(c)) continue;
    const withStamp = typeof c['createdAt'] === 'number' ? c : { ...c, createdAt: Date.now() };
    const clamped = clampToSchema(customLanguageSchema, withStamp);
    const result = valibot.safeParse(customLanguageSchema, clamped);
    let row: CustomLanguage;
    if (result.success) row = result.output;
    else if (
      onInvalid === 'keep' &&
      typeof c['id'] === 'string' &&
      typeof c['label'] === 'string'
    ) {
      // clampToSchema visits only the keys the row has, and a prompt reads hint and examples unguarded.
      const partial = clamped as Partial<Record<keyof CustomLanguage, unknown>>;
      row = {
        ...partial,
        hint: typeof partial.hint === 'string' ? partial.hint : '',
        examples: Array.isArray(partial.examples) ? (partial.examples as unknown[]) : [],
      } as CustomLanguage;
      kept++;
    } else continue;
    if (hasNestedDetectRegex(row.autoDetect)) {
      warnNestedRegex(`customLanguages[${row.id}].autoDetect`, row.autoDetect);
      const { autoDetect: _drop, ...rest } = row;
      row = rest;
    }
    if (taken.has(row.id)) continue;
    taken.add(row.id);
    out.push(row);
  }
  if (kept > 0)
    console.warn(
      `[ega.storage] ${kept} stored custom language row(s) fail the schema; kept as stored`,
    );
  return out;
}

export const CUSTOM_TASKS_MAX = 50;
const DEFAULT_CUSTOM_TASK_USER = ['TEXT:', '"""', '{{text}}', '"""'].join('\n');

/** parseCustomLanguageRows for tasks: a bad stored row with a string id and label is kept as stored, with only missing fields filled, since every writer writes the list back; a bad imported row is dropped. */
export function parseCustomTaskRows(
  raw: readonly unknown[],
  onInvalid: 'drop' | 'keep',
): CustomTask[] {
  const out: CustomTask[] = [];
  // A row may not take the id a closed rule scope points at, or that rule would match it.
  const taken = new Set<string>([...ALL_TASKS, UNKNOWN_TASK_ID]);
  let kept = 0;
  for (const c of raw) {
    if (out.length >= CUSTOM_TASKS_MAX) break;
    if (!isPlainObject(c)) continue;
    const withStamp = typeof c['createdAt'] === 'number' ? c : { ...c, createdAt: Date.now() };
    const clamped = clampToSchema(customTaskSchema, withStamp);
    const result = valibot.safeParse(customTaskSchema, clamped);
    let row: CustomTask;
    if (result.success) row = result.output;
    else if (
      onInvalid === 'keep' &&
      typeof c['id'] === 'string' &&
      typeof c['label'] === 'string'
    ) {
      const p = clamped as Partial<Record<keyof CustomTask, unknown>>;
      const flag = (k: 'pageContext' | 'image' | 'glossary'): boolean =>
        typeof p[k] === 'boolean' ? p[k] : false;
      row = {
        ...p,
        system: typeof p.system === 'string' ? p.system : '',
        user: typeof p.user === 'string' ? p.user : DEFAULT_CUSTOM_TASK_USER,
        output: typeof c['output'] === 'string' ? c['output'] : 'plain',
        pageContext: flag('pageContext'),
        image: flag('image'),
        glossary: flag('glossary'),
      } as CustomTask;
      kept++;
    } else continue;
    if (taken.has(row.id)) continue;
    taken.add(row.id);
    out.push(row);
  }
  if (kept > 0)
    console.warn(`[ega.storage] ${kept} stored custom task row(s) fail the schema; kept as stored`);
  return out;
}
