import { describe, it, expect, beforeEach } from 'vitest';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { addCustomVariety, listVarieties, updateVariety } from '@/shared/varieties';

const ARABIZI = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi');
if (!ARABIZI?.autoDetect) throw new Error('test setup: arabizi preset or its pattern missing');
const ARABIZI_ID = ARABIZI.id;
const ARABIZI_DETECT = ARABIZI.autoDetect;

const NESTED = { regex: '(a+)+$', flags: '', minScore: 1 };

const find = async (id: string) => (await listVarieties()).find((v) => v.id === id);

describe('updateVariety refuses a detection pattern with a nested repeat', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('on a built-in: nothing is stored and the editor gets a named reason', async () => {
    await expect(updateVariety(ARABIZI_ID, { autoDetect: NESTED })).rejects.toThrow(
      'nested-quantifier',
    );

    expect((await find(ARABIZI_ID))?.hasOverrides).toBe(false);
  });

  it('on a custom language: the stored pattern stays as it was', async () => {
    const c = await addCustomVariety({ label: 'Slang', hint: 'desc', examples: [] });

    await expect(updateVariety(c.id, { autoDetect: NESTED })).rejects.toThrow('nested-quantifier');

    expect((await find(c.id))?.autoDetect).toBeUndefined();
  });

  it('still stores the shipped Arabizi pattern as an override', async () => {
    await updateVariety(ARABIZI_ID, { autoDetect: { ...ARABIZI_DETECT, minScore: 3 } });

    expect((await find(ARABIZI_ID))?.autoDetect).toEqual({ ...ARABIZI_DETECT, minScore: 3 });
  });
});
