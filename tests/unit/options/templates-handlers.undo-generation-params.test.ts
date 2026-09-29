import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { getSettings } from '@/shared/storage';
import { createTemplatesHandlers } from '@/options/templates-handlers';
import type { Recipe } from '@/shared/recipes';
import type { Settings } from '@/shared/types';

async function makeCtx(seed: Partial<Settings> = {}): Promise<{
  ctx: Parameters<typeof createTemplatesHandlers>[0];
  current: () => Settings;
}> {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, ...seed },
  });
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

describe('undoRecipeApply — generation params the recipe introduced', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('removes a temperature and maxTokens the task did not have before the apply', async () => {
    const { ctx, current } = await makeCtx({ taskTemperatures: {}, taskMaxTokens: {} });
    const handlers = createTemplatesHandlers(ctx);
    const recipe: Recipe = {
      id: 'r-new-params',
      task: 'reword',
      label: 'Adds params',
      description: '',
      generationParams: { temperature: 0.9, maxTokens: 2000 },
    };

    const snap = await handlers.applyRecipeFull(recipe);
    expect(current().taskTemperatures?.['reword']).toBe(0.9);
    expect(current().taskMaxTokens?.['reword']).toBe(2000);

    await handlers.undoRecipeApply(snap);

    expect(current().taskTemperatures?.['reword']).toBeUndefined();
    expect(current().taskMaxTokens?.['reword']).toBeUndefined();
  });

  it('leaves an unrelated task’s params untouched', async () => {
    const { ctx, current } = await makeCtx({
      taskTemperatures: { translate: 0.3 },
      taskMaxTokens: { translate: 800 },
    });
    const handlers = createTemplatesHandlers(ctx);
    const recipe: Recipe = {
      id: 'r-other-task',
      task: 'reword',
      label: 'Adds params',
      description: '',
      generationParams: { temperature: 0.9, maxTokens: 2000 },
    };

    const snap = await handlers.applyRecipeFull(recipe);
    await handlers.undoRecipeApply(snap);

    expect(current().taskTemperatures?.['reword']).toBeUndefined();
    expect(current().taskTemperatures?.['translate']).toBe(0.3);
    expect(current().taskMaxTokens?.['translate']).toBe(800);
  });
});
