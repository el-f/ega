import { describe, it, expect, beforeEach } from 'vitest';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import {
  listVarieties,
  updateVariety,
  resetVariety,
  addCustomVariety,
  deleteVariety,
  findVarietyRaw,
} from '@/shared/varieties';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { CustomLanguage } from '@/shared/types';
import { invariant } from '@/shared/invariants';
import { preset } from '@tests/_helpers/lang';

const ARABIZI_PRESET = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi');
invariant(ARABIZI_PRESET, 'test setup: arabizi preset missing');
const ARABIZI_ID = ARABIZI_PRESET.id;

const getVariety = async (id: string) => (await listVarieties()).find((v) => v.id === id) ?? null;

describe('varieties module', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('listVarieties returns all built-ins + customs unified', async () => {
    const before = await listVarieties();
    const builtinIds = new Set(BUILT_IN_PRESETS.map((p) => p.id));
    const listedBuiltinIds = before.filter((v) => v.kind === 'builtin').map((v) => v.id);
    expect(new Set(listedBuiltinIds)).toEqual(builtinIds);

    await addCustomVariety({ label: 'My Slang', hint: 'internal team jargon', examples: [] });
    const after = await listVarieties();
    const customs = after.filter((v) => v.kind === 'custom');
    expect(customs).toHaveLength(1);
    expect(customs[0]?.label).toBe('My Slang');
  });

  it('getVariety applies overrides on built-ins', async () => {
    await updateVariety(ARABIZI_ID, { hint: 'OVERRIDDEN' });
    const v = await getVariety(ARABIZI_ID);
    expect(v).not.toBeNull();
    invariant(v, 'expected variety');
    expect(v.hint).toBe('OVERRIDDEN');
    expect(v.hasOverrides).toBe(true);
    expect(v.kind).toBe('builtin');
  });

  it('updateVariety with all-undefined patch clears the override (no-op-override drop)', async () => {
    // updateVariety prunes to empty and writes; without the replace bypass the deep merge would bring the key back.
    await updateVariety(ARABIZI_ID, { hint: 'OVERRIDDEN' });
    const v1 = await getVariety(ARABIZI_ID);
    invariant(v1, 'expected variety');
    expect(v1.hasOverrides).toBe(true);
    await updateVariety(ARABIZI_ID, { hint: undefined });
    const v2 = await getVariety(ARABIZI_ID);
    invariant(v2, 'expected variety');
    expect(v2.hasOverrides).toBe(false);
  });

  // The editor sends every field, and a stored copy of the shipped regex shadowed every later fix to it.
  it('a hint-only edit of a built-in stores the hint and not a copy of the shipped fields', async () => {
    await updateVariety(ARABIZI_ID, {
      hint: 'my own hint',
      examples: ARABIZI_PRESET.examples.map((e) => ({ ...e })),
      ...(ARABIZI_PRESET.autoDetect ? { autoDetect: { ...ARABIZI_PRESET.autoDetect } } : {}),
    });
    // Raw storage, not getSettings(): the read path prunes the same fields and would hide a write that kept them.
    const raw = (await chrome.storage.local.get('ega.settings'))['ega.settings'] as {
      varietyOverrides?: Record<string, unknown>;
    };
    expect(raw.varietyOverrides?.[ARABIZI_ID]).toEqual({ hint: 'my own hint' });
  });

  it('resetVariety clears the built-in override', async () => {
    const shippedPreset = BUILT_IN_PRESETS.find((p) => p.id === ARABIZI_ID);
    invariant(shippedPreset, 'test setup: shipped preset missing');
    const shipped = shippedPreset.hint;
    await updateVariety(ARABIZI_ID, { hint: 'OVERRIDDEN' });
    await resetVariety(ARABIZI_ID);
    const v = await getVariety(ARABIZI_ID);
    invariant(v, 'expected variety');
    expect(v.hint).toBe(shipped);
    expect(v.hasOverrides).toBe(false);
  });

  it('updateVariety on a custom id writes back to customLanguages', async () => {
    const c = await addCustomVariety({ label: 'X', hint: 'y', examples: [] });
    await updateVariety(c.id, { hint: 'Z' });
    const got = await getVariety(c.id);
    invariant(got, 'expected custom variety');
    expect(got.hint).toBe('Z');
    expect(got.kind).toBe('custom');
    expect(got.hasOverrides).toBe(false);
  });

  it('resetVariety on a custom throws', async () => {
    const c = await addCustomVariety({ label: 'X', hint: 'y', examples: [] });
    await expect(resetVariety(c.id)).rejects.toThrow(/custom/i);
  });

  it('deleteVariety removes a custom; refuses built-in', async () => {
    const c = await addCustomVariety({ label: 'X', hint: 'y', examples: [] });
    await deleteVariety(c.id);
    expect(await getVariety(c.id)).toBeNull();
    await expect(deleteVariety(ARABIZI_ID)).rejects.toThrow(/built-in/i);
  });

  it('listVarieties reports .disabled correctly for items in disabledVarieties', async () => {
    const s = ((await chrome.storage.local.get('ega.settings'))['ega.settings'] ?? {}) as Record<
      string,
      unknown
    >;
    await chrome.storage.local.set({
      'ega.settings': { ...s, disabledVarieties: [ARABIZI_ID] },
    });
    const list = await listVarieties();
    const arabizi = list.find((v) => v.id === ARABIZI_ID);
    invariant(arabizi, 'expected arabizi in list');
    expect(arabizi.disabled).toBe(true);
  });

  it('deleteVariety removes orphaned perPresetTemplates key', async () => {
    const { getSettings, replacePerPresetTemplates } = await import('@/shared/storage');
    const c = await addCustomVariety({ label: 'Temp', hint: 'will be deleted', examples: [] });
    const tpl = { system: 'sys', user: 'usr' };
    await replacePerPresetTemplates({ [c.id]: tpl });
    const before = await getSettings();
    expect(Object.hasOwn(before.advanced.perPresetTemplates, c.id)).toBe(true);
    await deleteVariety(c.id);
    const after = await getSettings();
    expect(Object.hasOwn(after.advanced.perPresetTemplates, c.id)).toBe(false);
  });

  it('addCustomVariety rejects 201st entry with cap-reached error', async () => {
    const list = Array.from({ length: 200 }, (_, i) => ({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      label: `Lang${i}`,
      hint: `hint${i}`,
      examples: [] as Array<{ src: string; tgt: string }>,
      createdAt: Date.now(),
    }));
    await chrome.storage.local.set({ 'ega.customLanguages': list });
    await expect(
      addCustomVariety({ label: 'One Too Many', hint: 'over cap', examples: [] }),
    ).rejects.toThrow('cap-reached');
  });

  it('addCustomVariety succeeds for the 200th entry', async () => {
    const list = Array.from({ length: 199 }, (_, i) => ({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      label: `Lang${i}`,
      hint: `hint${i}`,
      examples: [] as Array<{ src: string; tgt: string }>,
      createdAt: Date.now(),
    }));
    await chrome.storage.local.set({ 'ega.customLanguages': list });
    await expect(
      addCustomVariety({ label: 'Last Allowed', hint: 'exactly 200', examples: [] }),
    ).resolves.toBeTruthy();
  });

  it('updateVariety on custom persists autoDetect', async () => {
    const c = await addCustomVariety({ label: 'Slang', hint: 'desc', examples: [] });
    const ad = { regex: '[αβγ]', flags: 'i', minScore: 0.6 };
    await updateVariety(c.id, { autoDetect: ad });
    const got = await getVariety(c.id);
    invariant(got, 'expected custom variety after updateVariety');
    expect(got.autoDetect).toEqual(ad);
  });

  it('updateVariety on custom does not drop pre-existing autoDetect when patch omits it', async () => {
    const ad = { regex: '[αβγ]', flags: '', minScore: 0.5 };
    const c = await addCustomVariety({
      label: 'Slang',
      hint: 'desc',
      examples: [],
      autoDetect: ad,
    });
    await updateVariety(c.id, { hint: 'updated hint' });
    const got = await getVariety(c.id);
    invariant(got, 'expected custom variety');
    expect(got.autoDetect).toEqual(ad);
  });

  it('addCustomVariety threads autoDetect through to storage', async () => {
    const ad = { regex: '[xyz]', flags: 'g', minScore: 0.7 };
    const variety = await addCustomVariety({
      label: 'TestLang',
      hint: 'hint',
      examples: [],
      autoDetect: ad,
    });
    expect(variety.autoDetect).toEqual(ad);
    const got = await getVariety(variety.id);
    invariant(got, 'expected variety');
    expect(got.autoDetect).toEqual(ad);
  });

  it('listVarieties({ enabledOnly: true }) excludes disabled entries', async () => {
    const s = ((await chrome.storage.local.get('ega.settings'))['ega.settings'] ?? {}) as Record<
      string,
      unknown
    >;
    await chrome.storage.local.set({
      'ega.settings': { ...s, disabledVarieties: [ARABIZI_ID] },
    });
    const list = await listVarieties({ enabledOnly: true });
    expect(list.find((v) => v.id === ARABIZI_ID)).toBeUndefined();
  });
});

// Mutation-invariant discipline: idempotency, reversibility, cap edges, post-error state.
describe('varieties — mutation invariants', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  // addCustomVariety appends: two calls with the same label make two entries.
  describe('addCustomVariety — append semantics', () => {
    it('calling twice with the same label creates two distinct entries', async () => {
      await addCustomVariety({ label: 'Slang', hint: 'h', examples: [] });
      await addCustomVariety({ label: 'Slang', hint: 'h', examples: [] });

      const list = await listVarieties();
      const customs = list.filter((v) => v.kind === 'custom' && v.label === 'Slang');
      expect(customs).toHaveLength(2);
      expect(customs[0]?.id).not.toBe(customs[1]?.id);
    });
  });

  // Mutation-invariant discipline: reversibility — deleteVariety followed by
  // re-add must produce a clean slate (no ghost state).
  describe('deleteVariety — reversibility', () => {
    it('delete then re-add works without ghost state', async () => {
      const c = await addCustomVariety({ label: 'Temp', hint: 'h', examples: [] });
      await deleteVariety(c.id);
      expect(await getVariety(c.id)).toBeNull();

      const c2 = await addCustomVariety({ label: 'Temp', hint: 'h', examples: [] });
      expect(await getVariety(c2.id)).not.toBeNull();
      // The new id is different — the old id is gone
      expect(c2.id).not.toBe(c.id);
    });

    it('deleting an already-deleted custom id does not throw', async () => {
      const c = await addCustomVariety({ label: 'ToDelete', hint: 'h', examples: [] });
      await deleteVariety(c.id);
      // Second delete: id no longer exists in customLanguages — deleteCustomLanguage
      // filters, so this is a safe no-op.
      await expect(deleteVariety(c.id)).resolves.toBeUndefined();
      expect(await getVariety(c.id)).toBeNull();
    });
  });

  // Mutation-invariant discipline: composition — updateVariety on built-in label
  // patch must be silently dropped (label is immutable on built-ins).
  describe('updateVariety — label immutability on built-ins', () => {
    it('label patch on a built-in is silently ignored', async () => {
      const before = await getVariety(ARABIZI_ID);
      invariant(before, 'expected arabizi');
      const originalLabel = before.label;

      await updateVariety(ARABIZI_ID, { label: 'TAMPERED', hint: 'override' });

      const after = await getVariety(ARABIZI_ID);
      invariant(after, 'expected arabizi after update');
      expect(after.label).toBe(originalLabel);
      expect(after.hint).toBe('override');
    });
  });

  // Mutation-invariant discipline: post-error state — updating an unknown custom id
  // must throw without corrupting existing state.
  describe('updateVariety — unknown custom id throws', () => {
    it('throws on unknown custom id without touching existing customs', async () => {
      const good = await addCustomVariety({ label: 'Good', hint: 'g', examples: [] });
      const { asLangPresetIdUnsafe } = await import('@/shared/brands');
      const fakeId = asLangPresetIdUnsafe('no-such-custom-id');

      await expect(updateVariety(fakeId, { hint: 'attempt' })).rejects.toThrow(/unknown variety/i);

      // Existing entry must be intact.
      const got = await getVariety(good.id);
      invariant(got, 'expected existing variety');
      expect(got.hint).toBe('g');
    });
  });

  // Mutation-invariant discipline: idempotency — resetVariety called N times
  // must leave the same state as calling once.
  describe('resetVariety — idempotency', () => {
    it('resetting a built-in twice leaves hasOverrides=false both times', async () => {
      await updateVariety(ARABIZI_ID, { hint: 'OVERRIDDEN' });

      await resetVariety(ARABIZI_ID);
      await resetVariety(ARABIZI_ID);

      const v = await getVariety(ARABIZI_ID);
      invariant(v, 'expected variety');
      expect(v.hasOverrides).toBe(false);
    });
  });
});

describe('findVarietyRaw', () => {
  it('hits a built-in by id', () => {
    const result = findVarietyRaw(DEFAULT_SETTINGS, [], ARABIZI_ID);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(ARABIZI_ID);
    expect(result?.kind).toBe('builtin');
  });

  it('hits a custom by id', () => {
    const custom: CustomLanguage = {
      id: preset('cl-x'),
      label: 'X',
      hint: 'test hint',
      examples: [],
      createdAt: 1,
    };
    const result = findVarietyRaw(DEFAULT_SETTINGS, [custom], 'cl-x');
    expect(result?.label).toBe('X');
    expect(result?.kind).toBe('custom');
  });

  it('returns null for unknown id', () => {
    expect(findVarietyRaw(DEFAULT_SETTINGS, [], 'no-such-id')).toBeNull();
  });

  it('applies override from settings when hitting a built-in', () => {
    const s = { ...DEFAULT_SETTINGS, varietyOverrides: { [ARABIZI_ID]: { hint: 'OVERRIDDEN' } } };
    const result = findVarietyRaw(s, [], ARABIZI_ID);
    expect(result?.hint).toBe('OVERRIDDEN');
    expect(result?.hasOverrides).toBe(true);
  });
});
