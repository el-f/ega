import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { updateVariety } from '@/shared/varieties';
import { invariant } from '@/shared/invariants';
import type * as RegexRisk from '@/shared/regex-risk';

// The slowness probe times real regex runs, so a loaded machine can call any pattern slow; here it always does.
vi.mock('@/shared/regex-risk', async (importOriginal) => ({
  ...(await importOriginal<typeof RegexRisk>()),
  isSlowPattern: () => true,
}));

const ARABIZI = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi');
invariant(ARABIZI?.autoDetect, 'test setup: arabizi preset with a pattern');

describe('updateVariety on a built-in', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('accepts its own shipped pattern without timing it, so a hint edit never fails as slow', async () => {
    invariant(ARABIZI.autoDetect, 'pattern');
    await expect(
      updateVariety(ARABIZI.id, { hint: 'my hint', autoDetect: { ...ARABIZI.autoDetect } }),
    ).resolves.toBeUndefined();
  });

  it('still refuses a changed pattern that the probe calls slow', async () => {
    invariant(ARABIZI.autoDetect, 'pattern');
    await expect(
      updateVariety(ARABIZI.id, {
        autoDetect: { ...ARABIZI.autoDetect, regex: `${ARABIZI.autoDetect.regex}|x` },
      }),
    ).rejects.toThrow('slow-pattern');
  });
});
