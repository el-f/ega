import { asLangPresetIdUnsafe } from './brands';
import { BUILT_IN_PRESETS } from './presets';
import { hasNestedQuantifier } from './safe-regex';
import { withoutShippedFields } from './storage/sanitise';
import {
  getSettings,
  replaceVarietyOverrides,
  replacePerPresetTemplates,
  getCustomLanguages,
  upsertCustomLanguage,
  deleteCustomLanguage,
} from './storage';
import type { CustomLanguage, Settings, Variety, VarietyEdit } from './types';
import { uuid } from './uuid';

/** Applies the user override, except label: a built-in keeps its shipped label. */
function builtInAsVariety(
  id: string,
  edit: VarietyEdit | undefined,
  disabled: boolean,
): Variety | null {
  const base = BUILT_IN_PRESETS.find((p) => p.id === id);
  if (!base) return null;
  const hasOverrides = !!edit && Object.keys(edit).length > 0;
  return {
    id: base.id,
    label: base.label,
    hint: edit?.hint ?? base.hint,
    examples: edit?.examples ?? base.examples,
    ...((edit?.autoDetect ?? base.autoDetect)
      ? { autoDetect: edit?.autoDetect ?? base.autoDetect }
      : {}),
    kind: 'builtin' as const,
    disabled,
    hasOverrides,
  };
}

function customAsVariety(c: CustomLanguage, disabled: boolean): Variety {
  return {
    id: c.id,
    label: c.label,
    hint: c.hint,
    examples: c.examples,
    ...(c.autoDetect ? { autoDetect: c.autoDetect } : {}),
    kind: 'custom' as const,
    disabled,
    hasOverrides: false,
    createdAt: c.createdAt,
  };
}

/** Pure version of listVarieties for callers that already hold the settings snapshot. */
export function materializeVarieties(
  s: Settings,
  customs: CustomLanguage[],
  opts?: { enabledOnly?: boolean },
): Variety[] {
  const disabled = new Set<string>(s.disabledVarieties);
  const overrides = s.varietyOverrides;
  const builtinVs = BUILT_IN_PRESETS.map((p) =>
    builtInAsVariety(p.id, overrides[p.id], disabled.has(p.id)),
  ).filter((v): v is Variety => v !== null);
  // A stored row that repeats an id would render two entries under one key, which throws in the keyed list.
  const seen = new Set<string>(builtinVs.map((v) => v.id));
  const customVs: Variety[] = [];
  for (const c of customs) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    customVs.push(customAsVariety(c, disabled.has(c.id)));
  }
  const all = [...builtinVs, ...customVs];
  return opts?.enabledOnly ? all.filter((v) => !v.disabled) : all;
}

/** Single lookup without building the list, for router paths that check disabled themselves. */
export function findVarietyRaw(s: Settings, customs: CustomLanguage[], id: string): Variety | null {
  const overrides = s.varietyOverrides;
  const disabled = s.disabledVarieties.includes(id);
  const builtin = BUILT_IN_PRESETS.some((p) => p.id === id);
  if (builtin) return builtInAsVariety(id, overrides[id], disabled);
  const custom = customs.find((c) => c.id === id);
  if (custom) return customAsVariety(custom, disabled);
  return null;
}

export async function listVarieties(opts?: { enabledOnly?: boolean }): Promise<Variety[]> {
  const [s, customs] = await Promise.all([getSettings(), getCustomLanguages()]);
  return materializeVarieties(s, customs, opts);
}

export async function updateVariety(id: string, patch: VarietyEdit): Promise<void> {
  // 'nested-quantifier' is a message the Languages tab turns into its own copy.
  if (patch.autoDetect && hasNestedQuantifier(patch.autoDetect.regex)) {
    throw new Error('nested-quantifier');
  }
  const builtin = BUILT_IN_PRESETS.some((p) => p.id === id);
  if (builtin) {
    // Built-in label is immutable — silently drop any `label` on the patch.
    const { label: _drop, ...patchWithoutLabel } = patch;
    // Under the lock, past the deep merge: the pruned-to-empty branch drops the key, and a sibling override written meanwhile stays.
    await replaceVarietyOverrides((cur) => {
      const next: Record<string, VarietyEdit> = { ...cur };
      const merged: VarietyEdit = { ...next[id], ...patchWithoutLabel };
      const pruned = withoutShippedFields(
        id,
        Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)),
      ) as VarietyEdit;
      if (Object.keys(pruned).length === 0) delete next[id];
      else next[id] = pruned;
      return next;
    });
    return;
  }
  const customs = await getCustomLanguages();
  const existing = customs.find((c) => c.id === id);
  if (!existing) throw new Error(`unknown variety: ${id}`);
  const updated: CustomLanguage = {
    ...existing,
    label: patch.label ?? existing.label,
    hint: patch.hint ?? existing.hint,
    examples: patch.examples ?? existing.examples,
    ...(patch.autoDetect !== undefined
      ? { autoDetect: patch.autoDetect }
      : existing.autoDetect !== undefined
        ? { autoDetect: existing.autoDetect }
        : {}),
  };
  await upsertCustomLanguage(updated);
}

export async function resetVariety(id: string): Promise<void> {
  const builtin = BUILT_IN_PRESETS.some((p) => p.id === id);
  if (!builtin)
    throw new Error(`cannot reset a custom variety (reset applies only to built-ins): ${id}`);
  // Past the deep merge, so the deleted key actually clears.
  await replaceVarietyOverrides((cur) => {
    const next: Record<string, VarietyEdit> = { ...cur };
    delete next[id];
    return next;
  });
}

export async function addCustomVariety(
  input: Omit<CustomLanguage, 'id' | 'createdAt'>,
): Promise<Variety> {
  const existingList = await getCustomLanguages();
  if (existingList.length >= 200) {
    throw new Error('cap-reached');
  }
  // Avoid the astronomically unlikely UUID-collision-with-a-built-in path.
  // If it ever hits, re-roll rather than shadow a shipped preset.
  let varietyId = uuid();
  const builtinIds = new Set<string>(BUILT_IN_PRESETS.map((p) => p.id));
  while (builtinIds.has(varietyId)) varietyId = uuid();
  const c: CustomLanguage = {
    ...input,
    id: asLangPresetIdUnsafe(varietyId),
    createdAt: Date.now(),
  };
  await upsertCustomLanguage(c);
  return customAsVariety(c, false);
}

export async function deleteVariety(id: string): Promise<void> {
  const builtin = BUILT_IN_PRESETS.some((p) => p.id === id);
  if (builtin) throw new Error(`cannot delete built-in variety: ${id}`);
  await deleteCustomLanguage(id);
  await replacePerPresetTemplates((cur) => {
    if (!Object.hasOwn(cur, id)) return cur;
    const perPreset = { ...cur };
    delete perPreset[id];
    return perPreset;
  });
}
