// Backs the cross-tab settings search. Entries come straight from
// `settings-spec.ts`, interpreted at runtime — no codegen step.

import { DEFAULT_SETTINGS } from './settings-defaults';
import type { Settings } from './types';
import { fuzzyMatch } from './fuzzy-match';
import {
  SETTINGS_SPEC,
  type IsModifiedSpec,
  type SettingEntrySpec,
  type SettingsTab,
} from './settings-spec';

export type { SettingsTab };

export interface SettingEntry extends Omit<SettingEntrySpec, 'isModified'> {
  readonly isModified?: (s: Settings) => boolean;
}

export interface SearchResult extends SettingEntry {
  readonly score: number;
  readonly matchedTerm: string;
}

function readPath(obj: unknown, dotPath: string): unknown {
  let cur: unknown = obj;
  for (const seg of dotPath.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function nonEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  if (typeof v === 'string') return v.length > 0;
  return false;
}

function compileIsModified(entry: SettingEntrySpec): ((s: Settings) => boolean) | undefined {
  const im: IsModifiedSpec | undefined = entry.isModified;
  if (!im) return undefined;
  switch (im.kind) {
    case 'eq':
      return (s) => readPath(s, im.path) !== readPath(DEFAULT_SETTINGS, im.path);
    case 'fallback':
      return (s) => {
        const v = readPath(s, im.path);
        return v !== undefined && v !== im.fallback;
      };
    case 'nonEmpty':
      return (s) => nonEmpty(readPath(s, im.path));
    case 'jsonStringify':
      return (s) =>
        JSON.stringify(readPath(s, im.path)) !==
        JSON.stringify(readPath(DEFAULT_SETTINGS, im.path));
    case 'custom':
      return im.fn;
  }
}

export const SETTINGS_REGISTRY: readonly SettingEntry[] = SETTINGS_SPEC.map((entry) => {
  const { isModified: _spec, ...rest } = entry;
  const isModified = compileIsModified(entry);
  return { ...rest, ...(isModified ? { isModified } : {}) };
});

/* By id, so isFieldModified is O(1) inside $derived blocks. */
const REGISTRY_BY_ID: ReadonlyMap<string, SettingEntry> = new Map(
  SETTINGS_REGISTRY.map((e) => [e.id, e]),
);

/** Single answer to 'is this modified' for dots, counts and the filter; throws on an unknown id. */
export function isFieldModified(id: string, s: Settings): boolean {
  const entry = REGISTRY_BY_ID.get(id);
  if (!entry) throw new Error(`isFieldModified: unknown registry id "${id}"`);
  return entry.isModified ? entry.isModified(s) : false;
}

const MAX_RESULTS = 50;

export interface SearchOptions {
  readonly modifiedOnly?: boolean;
  readonly settings?: Settings;
}

/** label 100, id 80, description 50, keyword 30; first hit wins; null = no match. */
function scoreEntry(entry: SettingEntry, q: string): { score: number; matchedTerm: string } | null {
  const labelLc = entry.label.toLowerCase();
  if (labelLc.includes(q)) {
    // Prefix matches rank first, then shorter labels, so "temperature" lands on the global row.
    const prefixBonus = labelLc.startsWith(q) ? 20 : 0;
    const exactBonus = labelLc === q ? 10 : 0;
    return { score: 100 + prefixBonus + exactBonus, matchedTerm: entry.label };
  }
  const idLc = entry.id.toLowerCase();
  if (idLc.includes(q)) return { score: 80, matchedTerm: entry.id };
  const descLc = entry.description.toLowerCase();
  if (descLc.includes(q)) return { score: 50, matchedTerm: entry.description };
  for (const kw of entry.keywords) {
    if (kw.toLowerCase().includes(q)) return { score: 30, matchedTerm: kw };
  }

  // Every token must appear across label, id, desc or keywords, so "key cache" still finds "Cache key explainer".
  const tokens = q.split(/\s+/).filter((t) => t.length > 0);
  const kwLc = entry.keywords.map((k) => k.toLowerCase());
  if (tokens.length >= 2) {
    let tokenScore = 0;
    let allHit = true;
    for (const t of tokens) {
      let hit = 0;
      if (labelLc.includes(t)) hit = labelLc.startsWith(t) ? 14 : 10;
      else if (idLc.includes(t)) hit = 8;
      else if (descLc.includes(t)) hit = 5;
      else if (kwLc.some((k) => k.includes(t))) hit = 3;
      if (hit === 0) {
        allHit = false;
        break;
      }
      tokenScore += hit;
    }
    if (allHit) return { score: tokenScore, matchedTerm: entry.label };
  }

  // Typo fallback — the length + density gates keep short or scattered queries from matching everything.
  if (q.length >= 4) {
    const hit = fuzzyMatch(q, labelLc);
    if (hit && hit.score >= 0.55) return { score: hit.score * 20, matchedTerm: entry.label };
    for (const kw of entry.keywords) {
      const kwHit = fuzzyMatch(q, kw.toLowerCase());
      if (kwHit && kwHit.score >= 0.55) return { score: kwHit.score * 15, matchedTerm: kw };
    }
  }
  return null;
}

/** Cross-tab settings search; empty query returns []. */
export function searchSettings(query: string, opts: SearchOptions = {}): readonly SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];
  for (const entry of SETTINGS_REGISTRY) {
    if (opts.modifiedOnly) {
      if (!opts.settings) continue;
      if (!entry.isModified) continue;
      if (!entry.isModified(opts.settings)) continue;
    }
    const m = scoreEntry(entry, q);
    if (!m) continue;
    results.push({ ...entry, score: m.score, matchedTerm: m.matchedTerm });
  }
  // An action found only through its description or keywords goes last: "temperature" wants the slider, not a reset.
  const demoted = (r: SearchResult): number => (r.type === 'action' && r.score < 100 ? 1 : 0);
  results.sort((a, b) => {
    if (demoted(a) !== demoted(b)) return demoted(a) - demoted(b);
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });
  return results;
}

export const SETTINGS_SEARCH_MAX_RESULTS = MAX_RESULTS;

export { TAB_LABELS } from './settings-tabs';
