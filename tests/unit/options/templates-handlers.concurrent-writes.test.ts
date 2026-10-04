// Two writes to sibling keys of one map, fired without waiting: both must land.
import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { getSettings } from '@/shared/storage';
import { createTemplatesHandlers } from '@/options/templates-handlers';
import type { Settings } from '@/shared/types';

async function makeCtx(): Promise<{
  ctx: Parameters<typeof createTemplatesHandlers>[0];
  current: () => Settings;
}> {
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS } });
  let s: Settings | null = await getSettings();
  return {
    ctx: {
      getSettings: () => s,
      setSettings: (next: Settings) => {
        s = next;
      },
    },
    current: () => {
      if (!s) throw new Error('settings null');
      return s;
    },
  };
}

beforeEach(() => {
  resetChromeMock();
});

describe('per-task maps under concurrent writes', () => {
  it('two task prompts saved back to back both survive', async () => {
    const { ctx } = await makeCtx();
    const h = createTemplatesHandlers(ctx);
    const a = { system: 'A', user: 'A {{text}}' };
    const b = { system: 'B', user: 'B {{text}}' };
    await Promise.all([h.setTaskTemplate('reword', a), h.setTaskTemplate('grammar', b)]);
    const stored = await getSettings();
    expect(stored.taskOverrides).toEqual({ reword: a, grammar: b });
  });

  it('two per-preset templates saved back to back both survive, and a clear drops only its key', async () => {
    const { ctx } = await makeCtx();
    const h = createTemplatesHandlers(ctx);
    const a = { system: 'A', user: 'A {{text}}' };
    const b = { system: 'B', user: 'B {{text}}' };
    await Promise.all([h.savePerPreset('arabizi', a), h.savePerPreset('hebrew', b)]);
    expect((await getSettings()).advanced.perPresetTemplates).toEqual({ arabizi: a, hebrew: b });
    await h.clearPerPreset('arabizi');
    expect((await getSettings()).advanced.perPresetTemplates).toEqual({ hebrew: b });
  });
});
