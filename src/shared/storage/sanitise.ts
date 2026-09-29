/** Turns a raw stored row into a valid `Settings`. Pure — no chrome.*, no locks. */
import { DEFAULT_SETTINGS } from '../settings-defaults';
import type {
  BackendId,
  CustomLanguage,
  LangSelection,
  Settings,
  SitePref,
  VarietyEdit,
} from '../types';
import { asBackendIdUnsafe, asLangSelection, LANG_ID_PATTERN } from '../brands';
import { BACKEND_IDS } from '../provider-ids';
import { BUILT_IN_PRESETS } from '../presets';
import { hasNestedQuantifier } from '../safe-regex';
import { clampToSchema, isPlainObject } from '../settings-clamp';
import * as valibot from 'valibot';
import {
  CURRENT_TEMPLATE_VERSION,
  customLanguageSchema,
  DEFAULT_PROMPT_TEMPLATE,
  isPromptTemplateCustomised,
  OPTIONAL_SETTINGS_KEYS,
  parseStoredSettings,
  type SettingsFromSchema,
} from '../settings-schema';

/** Matches LangPresetIdSchema's cap — a custom variety id is a 36-char UUID. */
const LANG_SELECTION_MAX = 64;

// Tells "pass through as a language code" from "must match a variety id" — the schema's own pattern, so `zh-Hant-TW` survives a read.
function isIsoLikeLang(s: string): boolean {
  return LANG_ID_PATTERN.test(s);
}

function warnDropped(field: string, value: unknown): void {
  console.warn(`[ega.storage] dropping dangling reference: ${field} = ${JSON.stringify(value)}`);
}

/** A built-in override keeps only what the user changed: a copy of a shipped field would shadow every later fix to the preset. */
export function withoutShippedFields(
  id: string,
  edit: Record<string, unknown>,
): Record<string, unknown> {
  const base = BUILT_IN_PRESETS.find((p) => p.id === id) as Record<string, unknown> | undefined;
  if (!base) return edit;
  return Object.fromEntries(
    Object.entries(edit).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k])),
  );
}

// A repeat nested in a repeat never returns on a long selection, so the pattern is dropped where it is read and never run.
function hasNestedDetectRegex(autoDetect: unknown): boolean {
  return (
    isPlainObject(autoDetect) &&
    typeof autoDetect['regex'] === 'string' &&
    hasNestedQuantifier(autoDetect['regex'])
  );
}

function warnNestedRegex(field: string, autoDetect: unknown): void {
  console.warn(
    `[ega.storage] dropping a detection pattern with a nested repeat: ${field} = ${JSON.stringify(autoDetect)}`,
  );
}

interface RefValidators {
  isBackendId: (id: string) => boolean;
  isVarietyId: (id: string) => boolean;
}

const BACKEND_ID_SET: ReadonlySet<string> = new Set<string>(BACKEND_IDS);

function buildRefValidators(customs: readonly CustomLanguage[]): RefValidators {
  const varietyIdSet = new Set<string>([
    ...BUILT_IN_PRESETS.map((p) => p.id),
    ...customs.map((c) => c.id),
  ]);
  return {
    isBackendId: (id) => BACKEND_ID_SET.has(id),
    isVarietyId: (id) => varietyIdSet.has(id),
  };
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
    const srcOk = src === 'auto' || isIsoLikeLang(src) || v.isVarietyId(src);
    const tgtOk = tgt === 'auto' || isIsoLikeLang(tgt) || v.isVarietyId(tgt);
    if (srcOk && tgtOk) {
      validDir = { source: asLangSelection(src), target: asLangSelection(tgt) };
    } else {
      warnDropped(`sitePrefs[${origin}].lastDirection`, dir);
    }
  }
  let defaultLang: LangSelection | undefined;
  const rawDefaultLang = pref['defaultLang'];
  if (typeof rawDefaultLang === 'string' && rawDefaultLang.length > 0) {
    const ok =
      rawDefaultLang === 'auto' || isIsoLikeLang(rawDefaultLang) || v.isVarietyId(rawDefaultLang);
    if (ok) {
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

function filterTaskBackends(
  parsed: ParsedSettings,
  validators: RefValidators,
): Settings['taskBackends'] {
  const cleaned: Record<string, 'auto' | string> = {};
  for (const [k, v] of Object.entries(parsed.taskBackends)) {
    if (typeof v !== 'string') continue;
    if (v === 'auto' || validators.isBackendId(v)) {
      cleaned[k] = v;
    } else {
      warnDropped(`taskBackends.${k}`, v);
    }
  }
  return cleaned as Settings['taskBackends'];
}

function resolveLangDefaults(
  parsed: ParsedSettings,
  validators: RefValidators,
): { defaultLang: LangSelection; defaultTargetLang: LangSelection } {
  const checkLang = (raw: LangSelection, field: string, fallback: LangSelection): LangSelection => {
    // A stored target of 'auto' would ask the model to translate into the source language.
    if (raw === 'auto') return field === 'defaultLang' ? raw : fallback;
    if (isIsoLikeLang(raw)) return raw;
    if (validators.isVarietyId(raw)) return raw;
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

function stripOptionalUndefs(s: Settings): Settings {
  const obj = s as unknown as Record<string, unknown>;
  for (const k of OPTIONAL_SETTINGS_KEYS) {
    if (obj[k] === undefined) delete obj[k];
  }
  return s;
}

export function sanitiseStoredSettings(
  stored: Record<string, unknown>,
  customs: readonly CustomLanguage[],
): Settings {
  const parsed = parseStoredSettings(stored, { defaults: DEFAULT_SETTINGS });
  const validators = buildRefValidators(customs);
  const refs = filterDanglingRefs(parsed, validators);
  const backendOrder = buildBackendOrder(stored);
  // DEFAULT_SETTINGS spreads first, or an optional field with no schema default breaks the empty-storage round-trip.
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...(parsed as Settings),
    ...resolveLangDefaults(parsed, validators),
    sitePrefs: sanitiseSitePrefsMap(parsed, validators),
    disabledVarieties: refs.disabledVarieties,
    varietyOverrides: refs.varietyOverrides,
    backendOrder,
    disabledBackends: refs.disabledBackends,
    taskBackends: filterTaskBackends(parsed, validators),
  };
  // A settings save writes the whole object, so an untouched template is a stored copy of an old default.
  if (!isPromptTemplateCustomised(merged.advanced.promptTemplate)) {
    merged.advanced = {
      ...merged.advanced,
      promptTemplate: { ...DEFAULT_PROMPT_TEMPLATE },
      templateVersion: CURRENT_TEMPLATE_VERSION,
    };
  }
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
