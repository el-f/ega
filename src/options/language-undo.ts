import type { CustomLanguage, Settings } from '@/shared/types';
import {
  getCustomLanguages,
  getSettings,
  replaceSettings,
  upsertCustomLanguage,
} from '@/shared/storage';
import { deleteVariety } from '@/shared/varieties';

/** What deleting a custom language removes: the row, where it sat, and the settings that named it. */
export interface DeletedLanguage {
  row: CustomLanguage;
  at: number;
  before: Settings;
}

/** Deletes a custom language and keeps what Undo needs; null when it was already gone. */
export async function deleteLanguage(id: string): Promise<DeletedLanguage | null> {
  const [before, rows] = await Promise.all([getSettings(), getCustomLanguages()]);
  const at = rows.findIndex((r) => r.id === id);
  const row = rows[at];
  await deleteVariety(id);
  return row ? { row, at, before } : null;
}

/** Puts the language back where it was, then every setting that named it; changes made since the delete stay. */
export async function restoreLanguage(d: DeletedLanguage): Promise<Settings> {
  // The row first: the settings reader drops a reference to a language it does not know.
  await upsertCustomLanguage(d.row, d.at);
  return replaceSettings((cur) => withLanguageRefs(cur, d.before, d.row.id));
}

type GlossaryEntry = Settings['glossary'][number];

function sameEntry(a: GlossaryEntry, b: GlossaryEntry): boolean {
  return (
    a.term === b.term &&
    a.translation === b.translation &&
    a.caseSensitive === b.caseSensitive &&
    a.sourceLang === b.sourceLang &&
    a.targetLang === b.targetLang
  );
}

function insertAt<T>(list: readonly T[], at: number, item: T): T[] {
  const next = [...list];
  next.splice(Math.min(at, next.length), 0, item);
  return next;
}

/** `cur` with the references to `id` that `before` held and the delete dropped. */
export function withLanguageRefs(cur: Settings, before: Settings, id: string): Settings {
  const next: Settings = { ...cur };

  const prompt = before.advanced.perPresetTemplates[id];
  if (prompt !== undefined) {
    next.advanced = {
      ...cur.advanced,
      perPresetTemplates: { ...cur.advanced.perPresetTemplates, [id]: prompt },
    };
  }

  const hiddenAt = before.disabledVarieties.indexOf(id);
  if (hiddenAt >= 0 && !cur.disabledVarieties.includes(id)) {
    next.disabledVarieties = insertAt(cur.disabledVarieties, hiddenAt, id);
  }

  if (before.defaultLang === id) next.defaultLang = before.defaultLang;
  if (before.defaultTargetLang === id) next.defaultTargetLang = before.defaultTargetLang;

  let glossary = cur.glossary;
  before.glossary.forEach((e, i) => {
    const scoped = e.sourceLang === id || e.targetLang === id;
    if (scoped && !glossary.some((g) => sameEntry(g, e))) glossary = insertAt(glossary, i, e);
  });
  next.glossary = glossary;

  next.contextMenuItems = cur.contextMenuItems.map((item) => {
    const was = before.contextMenuItems.find((b) => b.id === item.id);
    if (was?.kind !== 'task' || was.targetLang !== id) return item;
    if (item.kind !== 'task' || item.targetLang !== undefined) return item;
    return { ...item, targetLang: was.targetLang };
  });

  const sitePrefs = { ...cur.sitePrefs };
  for (const [origin, was] of Object.entries(before.sitePrefs)) {
    const dir = was.lastDirection;
    const ownDefault = was.defaultLang === id;
    const ownDir = dir !== undefined && (dir.source === id || dir.target === id);
    if (!ownDefault && !ownDir) continue;
    const now = sitePrefs[origin] ?? {};
    sitePrefs[origin] = {
      ...now,
      ...(ownDefault && now.defaultLang === undefined ? { defaultLang: was.defaultLang } : {}),
      ...(ownDir && now.lastDirection === undefined ? { lastDirection: dir } : {}),
    };
  }
  next.sitePrefs = sitePrefs;
  return next;
}
