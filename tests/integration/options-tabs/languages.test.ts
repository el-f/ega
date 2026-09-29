import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { getSettings, updateSettings } from '@/shared/storage';
import {
  listVarieties,
  updateVariety,
  resetVariety,
  addCustomVariety,
  deleteVariety,
} from '@/shared/varieties';
import { STORAGE_KEYS } from '@/shared/constants';
import { BUILT_IN_PRESETS } from '@/shared/presets';

describe('Languages tab — round-trip persistence', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  /** Mirror of Languages.svelte's toggleDisabled handler, lifted so we
   *  can exercise the exact write sequence the UI does. */
  async function toggleDisabled(id: string): Promise<void> {
    const s = await getSettings();
    const set = new Set(s.disabledVarieties);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    await updateSettings({ disabledVarieties: [...set] });
  }

  it('toggle off → variety.disabled=true, toggle on → disabled=false, across re-reads', async () => {
    const arabizi = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi');
    if (!arabizi) throw new Error('test setup: arabizi preset missing');
    const id = arabizi.id;

    // Initial state — nothing disabled.
    let list = await listVarieties();
    expect(list.find((v) => v.id === id)?.disabled).toBe(false);

    // Toggle off.
    await toggleDisabled(id);
    list = await listVarieties();
    expect(list.find((v) => v.id === id)?.disabled).toBe(true);

    // Toggle back on.
    await toggleDisabled(id);
    list = await listVarieties();
    expect(list.find((v) => v.id === id)?.disabled).toBe(false);
  });

  it('toggle persists the disabledVarieties list on disk', async () => {
    await toggleDisabled('arabizi');
    // Direct disk read — bypass getSettings' sanitizer.
    const raw = await chromeMock.storage.local.get(STORAGE_KEYS.settings);
    const stored = raw[STORAGE_KEYS.settings] as Record<string, unknown>;
    expect(stored['disabledVarieties']).toEqual(['arabizi']);
  });

  it('custom add → edit → delete round-trip', async () => {
    const added = await addCustomVariety({
      label: 'My Slang',
      hint: 'internal jargon',
      examples: [],
    });
    expect(added.id).toBeDefined();

    let list = await listVarieties();
    expect(list.find((v) => v.id === added.id)?.label).toBe('My Slang');

    await updateVariety(added.id, { hint: 'updated' });
    list = await listVarieties();
    expect(list.find((v) => v.id === added.id)?.hint).toBe('updated');

    await deleteVariety(added.id);
    list = await listVarieties();
    expect(list.find((v) => v.id === added.id)).toBeUndefined();
  });

  it('builtin examples edit persists + reset restores shipped defaults', async () => {
    const shipped = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi');
    if (!shipped) throw new Error('test setup: arabizi preset missing');
    const shippedExamples = shipped.examples;

    await updateVariety('arabizi', {
      hint: 'OVERRIDDEN',
      examples: [{ src: 'custom', tgt: 'overridden' }],
    });
    let v = (await listVarieties()).find((x) => x.id === 'arabizi');
    expect(v?.hint).toBe('OVERRIDDEN');
    expect(v?.examples).toEqual([{ src: 'custom', tgt: 'overridden' }]);
    expect(v?.hasOverrides).toBe(true);

    await resetVariety('arabizi');
    v = (await listVarieties()).find((x) => x.id === 'arabizi');
    expect(v?.hint).toBe(shipped.hint);
    expect(v?.examples).toEqual(shippedExamples);
    expect(v?.hasOverrides).toBe(false);
  });

  it('toggle N times ends in the expected state (N even = enabled, N odd = disabled)', async () => {
    // Stress test — simulates rapid user clicks; the bug would have
    // caused the state to appear to revert every time.
    for (let i = 0; i < 6; i += 1) {
      await toggleDisabled('arabizi');
    }
    // 6 toggles = back to enabled.
    let v = (await listVarieties()).find((x) => x.id === 'arabizi');
    expect(v?.disabled).toBe(false);

    for (let i = 0; i < 5; i += 1) {
      await toggleDisabled('arabizi');
    }
    // +5 more = 11 total = disabled.
    v = (await listVarieties()).find((x) => x.id === 'arabizi');
    expect(v?.disabled).toBe(true);
  });
});
