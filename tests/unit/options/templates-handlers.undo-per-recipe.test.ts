// Undo is per recipe: A's toast after applying B removes A's rules and restores A's task, and leaves B alone.
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

const recipeA: Recipe = {
  id: 'r-a',
  task: 'reword',
  label: 'A',
  description: '',
  template: { system: 'A-SYS', user: 'A {{text}}' },
  rules: [{ body: 'Rule from A.', category: 'prefer' }],
  generationParams: { temperature: 0.9, tone: 'blunt' },
};

const recipeB: Recipe = {
  id: 'r-b',
  task: 'summarize',
  label: 'B',
  description: '',
  rules: [{ body: 'Rule from B.', category: 'always' }],
  generationParams: { temperature: 0.2 },
};

describe('undoRecipeApply after another recipe was applied', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it("removes only A's rules and restores only A's task", async () => {
    const { ctx, current } = await makeCtx({ taskTemperatures: { reword: 0.5 } });
    const handlers = createTemplatesHandlers(ctx);

    const snapA = await handlers.applyRecipeFull(recipeA);
    await handlers.applyRecipeFull(recipeB);
    expect(current().advanced.rules.map((r) => r.body)).toEqual(['Rule from A.', 'Rule from B.']);

    await handlers.undoRecipeApply(snapA);

    const s = current();
    expect(s.advanced.rules.map((r) => r.body)).toEqual(['Rule from B.']);
    expect(s.advanced.taskTemplates['reword']).toBeUndefined();
    expect(s.advanced.taskTones['reword']).toBeUndefined();
    expect(s.taskTemperatures?.['reword']).toBe(0.5);
    // B's work stays.
    expect(s.taskTemperatures?.['summarize']).toBe(0.2);
  });

  it('undo removes only the rules that apply added: a repeat apply adds none, so its undo keeps the first', async () => {
    const { ctx, current } = await makeCtx();
    const handlers = createTemplatesHandlers(ctx);
    const first = await handlers.applyRecipeFull(recipeA);
    const second = await handlers.applyRecipeFull(recipeA);
    expect(current().advanced.rules).toHaveLength(1);
    expect(second.addedRuleIds).toEqual([]);

    await handlers.undoRecipeApply(second);
    expect(current().advanced.rules).toHaveLength(1);
    await handlers.undoRecipeApply(first);
    expect(current().advanced.rules).toHaveLength(0);
  });
});

describe('a full recipe list', () => {
  it('fails the save with the limit in the message instead of returning quietly', async () => {
    const { ctx } = await makeCtx({
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        userRecipes: Array.from({ length: 50 }, (_, i) => ({
          id: `u-${i}`,
          task: 'translate' as const,
          label: `Recipe ${i}`,
          description: '',
        })),
      },
    });
    const handlers = createTemplatesHandlers(ctx);
    await expect(handlers.saveRecipeFromCurrent('One more', '', 'translate')).rejects.toThrow(
      /Recipe limit/,
    );
  });
});
