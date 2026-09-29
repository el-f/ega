import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { CUSTOM_SLOTS_MAX, RULES_MAX, SLOT_DESCRIPTION_MAX } from '@/shared/settings-schema';
import { toastStore } from '@/shared/components/toastStore';
import { getSettings } from '@/shared/storage';
import { createTemplatesHandlers } from '@/options/templates-handlers';
import { serialiseRecipe, type Recipe } from '@/shared/recipes';
import type { Settings, PromptTemplate } from '@/shared/types';
import type { Task } from '@/shared/task-prompts';

const SAMPLE_TEMPLATE: PromptTemplate = {
  system: 'You are a helpful translator.',
  user: 'Translate: {{text}}',
};

async function makeCtx(seed: Partial<Settings> = {}): Promise<{
  ctx: {
    getSettings: () => Settings | null;
    setSettings: (n: Settings) => void;
  };
  current: () => Settings;
}> {
  const seedSettings = { ...DEFAULT_SETTINGS, ...seed };
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: seedSettings });
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

async function readStored(): Promise<Settings> {
  const r = await chromeMock.storage.local.get(STORAGE_KEYS.settings);
  return (r as Record<string, unknown>)[STORAGE_KEYS.settings] as Settings;
}

describe('templates-handlers', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  describe('applyRecipeFull', () => {
    it('writes template + rules + temperature + maxTokens + tone in one shot', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-full',
        task: 'reword',
        label: 'Full kitchen sink',
        description: 'covers all branches',
        template: { ...SAMPLE_TEMPLATE },
        rules: [
          { body: 'Always be polite.', category: 'always' },
          { body: 'Never swear.', category: 'never' },
        ],
        generationParams: {
          temperature: 0.42,
          maxTokens: 1234,
          tone: 'formal',
        },
      };

      await handlers.applyRecipeFull(recipe);

      const next = current();
      expect(next.advanced.taskTemplates['reword']).toEqual(SAMPLE_TEMPLATE);
      expect(next.advanced.rules).toHaveLength(2);
      expect(next.advanced.rules[0]?.body).toBe('Always be polite.');
      expect(next.advanced.rules[0]?.source).toBe('recipe');
      expect(next.advanced.rules[0]?.recipeId).toBe('r-full');
      expect(next.advanced.rules[0]?.scope.tasks).toEqual(['reword']);
      expect(next.taskTemperatures?.['reword']).toBe(0.42);
      expect(next.taskMaxTokens?.['reword']).toBe(1234);
      expect(next.advanced.taskTones['reword']).toBe('formal');
    });

    it('appendHeaderRule preserves a concurrent advanced write (no stale clobber)', async () => {
      const { ctx } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      // Simulate another surface writing advanced.temperature AFTER the
      // handler captured its settings snapshot but before the append lands.
      const stored = await readStored();
      await chromeMock.storage.local.set({
        [STORAGE_KEYS.settings]: {
          ...stored,
          advanced: { ...stored.advanced, temperature: 1.5 },
        },
      });

      await handlers.appendHeaderRule({
        id: 'hdr-1',
        body: 'be terse',
        category: 'always',
        scope: { tasks: [] },
      } as never);

      const persisted = await readStored();
      // The rule is appended AND the concurrent temperature change survives.
      expect(persisted.advanced.rules.some((r) => r.id === 'hdr-1')).toBe(true);
      expect(persisted.advanced.temperature).toBe(1.5);
    });

    it('writes only present generationParams fields (no template, no rules)', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-min',
        task: 'translate',
        label: 'min',
        description: '',
        generationParams: { temperature: 0.1 },
      };

      await handlers.applyRecipeFull(recipe);

      const next = current();
      expect(next.advanced.taskTemplates['translate']).toBeUndefined();
      expect(next.taskTemperatures?.['translate']).toBe(0.1);
      expect(next.taskMaxTokens?.['translate']).toBeUndefined();
    });

    it('appends recipe rules to existing rules — does not replace', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          rules: [
            {
              id: 'pre-existing',
              body: 'Pre-existing rule.',
              category: 'always',
              scope: { tasks: ['translate'] },
              source: 'manual',
              addedAt: new Date().toISOString(),
              enabled: true,
            },
          ],
        },
      });
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-rules',
        task: 'translate',
        label: 'add rules',
        description: '',
        rules: [{ body: 'Recipe rule.', category: 'prefer' }],
      };

      await handlers.applyRecipeFull(recipe);

      const next = current();
      expect(next.advanced.rules).toHaveLength(2);
      expect(next.advanced.rules[0]?.id).toBe('pre-existing');
      expect(next.advanced.rules[1]?.body).toBe('Recipe rule.');
      expect(next.advanced.rules[1]?.source).toBe('recipe');
    });
  });

  describe('applyRecipeRulesOnly', () => {
    it('appends rules without touching templates or generation params', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTemplates: { translate: { ...SAMPLE_TEMPLATE } },
        },
        taskTemperatures: { translate: 0.9 },
      });
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-rules-only',
        task: 'translate',
        label: 'rules only',
        description: '',
        template: { system: 'IGNORED', user: 'IGNORED' },
        rules: [{ body: 'Only rule.', category: 'always' }],
        generationParams: { temperature: 0.01, maxTokens: 99 },
      };

      await handlers.applyRecipeRulesOnly(recipe);

      const next = current();
      expect(next.advanced.rules).toHaveLength(1);
      expect(next.advanced.rules[0]?.body).toBe('Only rule.');
      expect(next.advanced.taskTemplates['translate']).toEqual(SAMPLE_TEMPLATE);
      expect(next.taskTemperatures?.['translate']).toBe(0.9);
      expect(next.taskMaxTokens?.['translate']).toBeUndefined();
    });

    it('drops the overflow instead of writing past the rule cap', async () => {
      const priorRules = Array.from({ length: RULES_MAX - 1 }, (_, i) => ({
        id: `prior-${i}`,
        body: `Prior rule ${i}.`,
        category: 'always' as const,
        scope: { tasks: ['translate' as Task] },
        source: 'manual' as const,
        addedAt: new Date().toISOString(),
        enabled: true,
      }));
      const { ctx, current } = await makeCtx({
        advanced: { ...DEFAULT_SETTINGS.advanced, rules: priorRules },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.applyRecipeRulesOnly({
        id: 'r-overflow',
        task: 'translate',
        label: 'overflow',
        description: '',
        rules: [
          { body: 'Fits.', category: 'always' },
          { body: 'Does not fit.', category: 'always' },
        ],
      });

      const rules = current().advanced.rules;
      expect(rules).toHaveLength(RULES_MAX);
      expect(rules.at(-1)?.body).toBe('Fits.');
      // Storage clamps to RULES_MAX from the front, so an over-cap write would lose the new rule.
      expect((await readStored()).advanced.rules.some((r) => r.body === 'Fits.')).toBe(true);
    });

    it('counts the rules that landed, not the rules the recipe carries', async () => {
      const priorRules = Array.from({ length: RULES_MAX - 1 }, (_, i) => ({
        id: `prior-${i}`,
        body: `Prior rule ${i}.`,
        category: 'always' as const,
        scope: { tasks: ['translate' as Task] },
        source: 'manual' as const,
        addedAt: new Date().toISOString(),
        enabled: true,
      }));
      const { ctx } = await makeCtx({
        advanced: { ...DEFAULT_SETTINGS.advanced, rules: priorRules },
      });
      const handlers = createTemplatesHandlers(ctx);
      const toast = vi.spyOn(toastStore, 'push').mockImplementation(() => {});

      await handlers.applyRecipeRulesOnly({
        id: 'r-count',
        task: 'translate',
        label: 'Two',
        description: '',
        rules: [
          { body: 'Fits.', category: 'always' },
          { body: 'Does not fit.', category: 'always' },
        ],
      });

      const messages = toast.mock.calls.map((c) => c[0].message);
      expect(messages.some((m) => m.includes('Added 1 rule from "Two"'))).toBe(true);
      expect(messages.some((m) => m.includes('Added 2 rules'))).toBe(false);
      toast.mockRestore();
    });

    it('says nothing was added when every rule is already there', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-dupe',
        task: 'translate',
        label: 'Dupe',
        description: '',
        rules: [{ body: 'Only rule.', category: 'always' }],
      };
      await handlers.applyRecipeRulesOnly(recipe);
      const toast = vi.spyOn(toastStore, 'push').mockImplementation(() => {});

      await handlers.applyRecipeRulesOnly(recipe);

      expect(current().advanced.rules).toHaveLength(1);
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast.mock.calls[0]?.[0].variant).not.toBe('success');
      toast.mockRestore();
    });

    it('no-op when recipe has no rules', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const beforeRules = current().advanced.rules.length;

      await handlers.applyRecipeRulesOnly({
        id: 'r-empty',
        task: 'translate',
        label: '',
        description: '',
      });

      expect(current().advanced.rules.length).toBe(beforeRules);
    });

    it('re-applying the same recipe does not duplicate its rules', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-dupe-check',
        task: 'translate',
        label: 'dupe check',
        description: '',
        rules: [
          { body: 'Rule A.', category: 'always' },
          { body: 'Rule B.', category: 'never' },
        ],
      };

      await handlers.applyRecipeRulesOnly(recipe);
      await handlers.applyRecipeRulesOnly(recipe);
      await handlers.applyRecipeRulesOnly(recipe);

      const rules = current().advanced.rules;
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.body).sort()).toEqual(['Rule A.', 'Rule B.']);
    });

    it('whitespace-only drift on recipe body still dedupes', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const first: Recipe = {
        id: 'r-trim',
        task: 'translate',
        label: 'trim',
        description: '',
        rules: [{ body: 'Trimmed body.', category: 'always' }],
      };
      const second: Recipe = {
        ...first,
        rules: [{ body: '  Trimmed body.  ', category: 'always' }],
      };

      await handlers.applyRecipeRulesOnly(first);
      await handlers.applyRecipeRulesOnly(second);

      expect(current().advanced.rules).toHaveLength(1);
    });

    it('different recipe with same body adds independently', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const recipeA: Recipe = {
        id: 'r-A',
        task: 'translate',
        label: 'A',
        description: '',
        rules: [{ body: 'Shared body.', category: 'always' }],
      };
      const recipeB: Recipe = { ...recipeA, id: 'r-B', label: 'B' };

      await handlers.applyRecipeRulesOnly(recipeA);
      await handlers.applyRecipeRulesOnly(recipeB);

      expect(current().advanced.rules).toHaveLength(2);
    });

    it('a rules-only write that never lands reports the failure once and claims no success', async () => {
      const { ctx } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const toast = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
      const set = vi
        .spyOn(chromeMock.storage.local, 'set')
        .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

      try {
        await handlers.applyRecipeRulesOnly({
          id: 'r-quota-rules',
          task: 'translate',
          label: 'Quota',
          description: '',
          rules: [{ body: 'Only rule.', category: 'always' }],
        });
      } finally {
        set.mockRestore();
      }

      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast.mock.calls[0]?.[0].variant).not.toBe('success');
      toast.mockRestore();
    });
  });

  describe('applyRecipeFull re-apply', () => {
    it('does not duplicate recipe-emitted rules on re-apply', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-full-dupe',
        task: 'translate',
        label: 'full dupe',
        description: '',
        template: { ...SAMPLE_TEMPLATE },
        rules: [
          { body: 'Rule X.', category: 'always' },
          { body: 'Rule Y.', category: 'never' },
        ],
      };

      await handlers.applyRecipeFull(recipe);
      await handlers.applyRecipeFull(recipe);

      const rules = current().advanced.rules;
      expect(rules).toHaveLength(2);
    });
  });

  describe('setTaskTone(task, null)', () => {
    it('DELETES the per-task tone key rather than setting null', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTones: { reword: 'formal', translate: 'casual' },
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskTone('reword', null);

      const next = current();
      expect('reword' in next.advanced.taskTones).toBe(false);
      expect(next.advanced.taskTones['translate']).toBe('casual');
    });

    it('sets a tone value when non-null', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskTone('reword', 'blunt');

      expect(current().advanced.taskTones['reword']).toBe('blunt');
    });
  });

  describe('setTaskTemperature(task, null)', () => {
    it('DELETES the per-task temperature key via replaceTaskTemperatures bypass', async () => {
      const { ctx, current } = await makeCtx({
        taskTemperatures: { translate: 0.7, reword: 0.3 },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskTemperature('translate', null);

      const next = current();
      expect('translate' in (next.taskTemperatures ?? {})).toBe(false);
      expect(next.taskTemperatures?.['reword']).toBe(0.3);

      const stored = await readStored();
      // The bypass must persist the deletion to storage — not just the in-memory state.
      expect('translate' in (stored.taskTemperatures ?? {})).toBe(false);
    });

    it('sets a temperature when non-null', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskTemperature('translate', 0.55);

      expect(current().taskTemperatures?.['translate']).toBe(0.55);
    });
  });

  describe('setTaskMaxTokens(task, null)', () => {
    it('DELETES the per-task maxTokens key via replaceTaskMaxTokens bypass', async () => {
      const { ctx, current } = await makeCtx({
        taskMaxTokens: { translate: 1000, reword: 2000 },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskMaxTokens('translate', null);

      const next = current();
      expect('translate' in (next.taskMaxTokens ?? {})).toBe(false);
      expect(next.taskMaxTokens?.['reword']).toBe(2000);

      const stored = await readStored();
      expect('translate' in (stored.taskMaxTokens ?? {})).toBe(false);
    });
  });

  describe('importRecipe', () => {
    it('decodes a serialized recipe and appends to userRecipes with a fresh id', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const source: Recipe = {
        id: 'will-be-overwritten',
        task: 'explain',
        label: 'Imported',
        description: 'from share link',
        rules: [{ body: 'Be terse.', category: 'prefer' }],
      };

      await handlers.importRecipe(serialiseRecipe(source));

      const list = current().advanced.userRecipes as readonly Recipe[];
      expect(list).toHaveLength(1);
      expect(list[0]?.label).toBe('Imported');
      expect(list[0]?.id).toMatch(/^user-/);
      expect(list[0]?.id).not.toBe('will-be-overwritten');
    });

    it('throws on invalid input', async () => {
      const { ctx } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await expect(handlers.importRecipe('not-base64-or-recipe')).rejects.toThrow(/recipe code/i);
    });
  });

  describe('saveRecipeFromCurrent', () => {
    it('captures current task template + temperature + maxTokens + tone into userRecipes', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTemplates: { reword: { ...SAMPLE_TEMPLATE } },
          taskTones: { reword: 'casual' },
        },
        taskTemperatures: { reword: 0.65 },
        taskMaxTokens: { reword: 800 },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.saveRecipeFromCurrent('My polish', 'My description', 'reword');

      const list = current().advanced.userRecipes as readonly Recipe[];
      expect(list).toHaveLength(1);
      const saved = list[0];
      if (!saved) throw new Error('saved recipe missing');
      expect(saved.label).toBe('My polish');
      expect(saved.description).toBe('My description');
      expect(saved.task).toBe('reword');
      expect(saved.template).toEqual(SAMPLE_TEMPLATE);
      expect(saved.generationParams).toEqual({
        temperature: 0.65,
        maxTokens: 800,
        tone: 'casual',
      });
      expect(saved.id).toMatch(/^user-/);
    });

    it('omits absent fields from generationParams', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.saveRecipeFromCurrent('label', 'desc', 'translate');

      const list = current().advanced.userRecipes as readonly Recipe[];
      const saved = list[0];
      if (!saved) throw new Error('saved recipe missing');
      expect(saved.template).toBeUndefined();
      expect(saved.generationParams).toEqual({});
    });
  });

  describe('deleteUserRecipe', () => {
    it('removes the matching id from userRecipes, leaves others intact', async () => {
      const seedRecipes: Recipe[] = [
        { id: 'r-keep-1', task: 'translate', label: 'a', description: '' },
        { id: 'r-drop', task: 'translate', label: 'b', description: '' },
        { id: 'r-keep-2', task: 'reword', label: 'c', description: '' },
      ];
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          userRecipes: seedRecipes as unknown as Settings['advanced']['userRecipes'],
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.deleteUserRecipe('r-drop');

      const list = current().advanced.userRecipes as readonly Recipe[];
      expect(list.map((r) => r.id)).toEqual(['r-keep-1', 'r-keep-2']);
    });
  });

  describe('setSnippets', () => {
    it('writes whole snippet map via replaceSnippets bypass', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          snippets: { old: 'should be replaced' },
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setSnippets({ fresh: 'replacement' });

      const next = current();
      expect(next.advanced.snippets).toEqual({ fresh: 'replacement' });
      expect('old' in next.advanced.snippets).toBe(false);

      const stored = await readStored();
      expect(stored.advanced.snippets).toEqual({ fresh: 'replacement' });
    });
  });

  describe('setCustomSlotDescription', () => {
    it('persists a custom slot description', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setCustomSlotDescription('myVar', 'The user name');

      expect(current().advanced.customSlotDescriptions['myVar']).toBe('The user name');
    });
  });

  describe('setTaskReasoningEffort(task, null)', () => {
    it('DELETES the per-task effort key via replaceTaskReasoningEfforts bypass', async () => {
      const { ctx, current } = await makeCtx({
        taskReasoningEfforts: { translate: 'high', reword: 'low' },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskReasoningEffort('translate', null);

      const next = current();
      expect('translate' in (next.taskReasoningEfforts ?? {})).toBe(false);
      expect(next.taskReasoningEfforts?.['reword']).toBe('low');

      const stored = await readStored();
      expect('translate' in (stored.taskReasoningEfforts ?? {})).toBe(false);
    });

    it('sets an effort when non-null', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskReasoningEffort('translate', 'high');

      expect(current().taskReasoningEfforts?.['translate']).toBe('high');
    });
  });

  describe('setGlobalReasoningEffort', () => {
    it('patches advanced.reasoningEffort', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setGlobalReasoningEffort('high');

      expect(current().advanced.reasoningEffort).toBe('high');
    });
  });

  describe('setGlobalTemperature / setGlobalMaxTokens', () => {
    it('patches advanced.temperature', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setGlobalTemperature(0.33);

      expect(current().advanced.temperature).toBe(0.33);
    });

    it('patches advanced.maxTokens', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setGlobalMaxTokens(2048);

      expect(current().advanced.maxTokens).toBe(2048);
    });
  });

  describe('snapshot correctness — getSettings() reads current in-memory state', () => {
    it('applyRecipeFull reads rules from the current ctx.getSettings() snapshot, not a stale ref', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          rules: [
            {
              id: 'existing-rule',
              body: 'Pre-existing rule.',
              category: 'always' as const,
              scope: { tasks: ['translate'] as const },
              source: 'manual' as const,
              addedAt: new Date().toISOString(),
              enabled: true,
            },
          ],
        },
      });
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-snapshot',
        task: 'translate',
        label: 'Snapshot test',
        description: '',
        rules: [{ body: 'New rule from recipe.', category: 'prefer' }],
      };

      await handlers.applyRecipeFull(recipe);

      const stored = await readStored();
      // Both the pre-existing rule and the recipe rule must land in storage.
      expect(stored.advanced.rules).toHaveLength(2);
      expect(stored.advanced.rules[0]?.id).toBe('existing-rule');
      expect(stored.advanced.rules[1]?.body).toBe('New rule from recipe.');
      expect(stored.advanced.rules[1]?.recipeId).toBe('r-snapshot');
      // Verify in-memory state matches storage.
      expect(current().advanced.rules).toHaveLength(2);
    });

    it('saveRecipeFromCurrent appends to userRecipes without wiping existing ones', async () => {
      const existingRecipe: Recipe = {
        id: 'existing-user-recipe',
        task: 'reword',
        label: 'Existing',
        description: '',
      };
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          userRecipes: [existingRecipe] as unknown as Settings['advanced']['userRecipes'],
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.saveRecipeFromCurrent('New one', 'desc', 'translate');

      const stored = await readStored();
      const list = stored.advanced.userRecipes as readonly Recipe[];
      expect(list).toHaveLength(2);
      expect(list[0]?.id).toBe('existing-user-recipe');
      expect(list[1]?.label).toBe('New one');
      expect(list[1]?.id).toMatch(/^user-/);
      // In-memory state must agree.
      expect(current().advanced.userRecipes as readonly Recipe[]).toHaveLength(2);
    });
  });

  describe('applyRecipeFull + undoRecipeApply', () => {
    it('undo restores taskTemplates, rules, and generation params to pre-apply values', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTemplates: { reword: { ...SAMPLE_TEMPLATE } },
          rules: [
            {
              id: 'pre',
              body: 'Pre-existing.',
              category: 'always',
              scope: { tasks: [] },
              source: 'manual',
              addedAt: new Date().toISOString(),
              enabled: true,
            },
          ],
        },
        taskTemperatures: { reword: 0.5 },
        taskMaxTokens: { reword: 512 },
      });
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-undo',
        task: 'reword',
        label: 'Undo test',
        description: '',
        template: { system: 'NEW', user: 'NEW {{text}}' },
        rules: [{ body: 'Recipe rule.', category: 'prefer' }],
        generationParams: { temperature: 0.9, maxTokens: 2000, tone: 'blunt' },
      };

      const snap = await handlers.applyRecipeFull(recipe);

      // After apply, state changed.
      expect(current().advanced.taskTemplates['reword']?.system).toBe('NEW');
      expect(current().advanced.rules).toHaveLength(2);
      expect(current().taskTemperatures?.['reword']).toBe(0.9);

      // Undo restores.
      await handlers.undoRecipeApply(snap);

      const restored = current();
      expect(restored.advanced.taskTemplates['reword']).toEqual(SAMPLE_TEMPLATE);
      expect(restored.advanced.rules).toHaveLength(1);
      expect(restored.advanced.rules[0]?.id).toBe('pre');
      expect(restored.taskTemperatures?.['reword']).toBe(0.5);
      expect(restored.taskMaxTokens?.['reword']).toBe(512);
    });

    it('undo keeps an edit made after the apply, and never touches a field the recipe did not set', async () => {
      const { ctx, current } = await makeCtx({
        advanced: { ...DEFAULT_SETTINGS.advanced, taskTones: { reword: 'formal' } },
        taskTemperatures: { reword: 0.5 },
        taskMaxTokens: { reword: 512 },
      });
      const handlers = createTemplatesHandlers(ctx);
      const snap = await handlers.applyRecipeFull({
        id: 'r-later-edit',
        task: 'reword',
        label: 'Later edit',
        description: '',
        generationParams: { temperature: 0.9, tone: 'blunt' },
      });
      const stored = await readStored();
      await chromeMock.storage.local.set({
        [STORAGE_KEYS.settings]: {
          ...stored,
          taskTemperatures: { ...stored.taskTemperatures, reword: 0.3 },
          taskMaxTokens: { ...stored.taskMaxTokens, reword: 4000 },
        },
      });

      await handlers.undoRecipeApply(snap);

      const after = current();
      expect(after.taskTemperatures?.['reword']).toBe(0.3);
      expect(after.taskMaxTokens?.['reword']).toBe(4000);
      expect(after.advanced.taskTones['reword']).toBe('formal');
    });
  });

  describe('patchAdvanced', () => {
    it('merges shape into advanced without clobbering sibling keys', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          temperature: 0.8,
          maxTokens: 1500,
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.patchAdvanced({ temperature: 0.2 });

      const next = current();
      expect(next.advanced.temperature).toBe(0.2);
      // maxTokens must survive the patch — deep merge in updateSettings.
      expect(next.advanced.maxTokens).toBe(1500);
    });
  });

  // Mutation-invariant discipline: idempotency — setting the same value twice must
  // leave state equal to setting it once.
  describe('idempotency', () => {
    it('setGlobalTemperature called N times with the same value is equivalent to calling once', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setGlobalTemperature(0.77);
      await handlers.setGlobalTemperature(0.77);
      await handlers.setGlobalTemperature(0.77);

      expect(current().advanced.temperature).toBe(0.77);
      const stored = await readStored();
      expect(stored.advanced.temperature).toBe(0.77);
    });

    it('setGlobalMaxTokens called N times with the same value is equivalent to calling once', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setGlobalMaxTokens(512);
      await handlers.setGlobalMaxTokens(512);

      expect(current().advanced.maxTokens).toBe(512);
    });

    it('setTaskTone same task + value twice yields single entry', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskTone('reword', 'formal');
      await handlers.setTaskTone('reword', 'formal');

      const tones = current().advanced.taskTones;
      expect(tones['reword']).toBe('formal');
      expect(Object.keys(tones).filter((k) => k === 'reword')).toHaveLength(1);
    });

    it('setCustomSlotDescription same key twice updates in place, no duplicate key', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setCustomSlotDescription('myVar', 'first');
      await handlers.setCustomSlotDescription('myVar', 'second');

      const descs = current().advanced.customSlotDescriptions;
      expect(descs['myVar']).toBe('second');
      expect(Object.keys(descs).filter((k) => k === 'myVar')).toHaveLength(1);
    });

    it('savePerPreset same preset twice overwrites, not appends', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const tpl1: PromptTemplate = { system: 'v1', user: '{{text}}' };
      const tpl2: PromptTemplate = { system: 'v2', user: '{{text}}' };

      await handlers.savePerPreset('arabizi', tpl1);
      await handlers.savePerPreset('arabizi', tpl2);

      const stored = current().advanced.perPresetTemplates;
      expect(stored['arabizi']).toEqual(tpl2);
      expect(Object.keys(stored).filter((k) => k === 'arabizi')).toHaveLength(1);
    });
  });

  // Mutation-invariant discipline: reversibility — undo/clear must invert the mutation
  // completely without side effects on unrelated state.
  describe('reversibility', () => {
    it('resetGlobalTemplate inverts saveGlobalTemplate', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const original = current().advanced.promptTemplate;

      await handlers.saveGlobalTemplate({ system: 'CUSTOM', user: 'CUSTOM {{text}}' });
      expect(current().advanced.promptTemplate.system).toBe('CUSTOM');

      await handlers.resetGlobalTemplate();

      expect(current().advanced.promptTemplate).toEqual(original);
    });

    it('clearPerPreset after savePerPreset leaves no key', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.savePerPreset('arabizi', { system: 'S', user: 'U' });
      expect(current().advanced.perPresetTemplates['arabizi']).toBeDefined();

      await handlers.clearPerPreset('arabizi');

      expect('arabizi' in current().advanced.perPresetTemplates).toBe(false);
      const stored = await readStored();
      expect('arabizi' in stored.advanced.perPresetTemplates).toBe(false);
    });

    it('setTaskTemplate(task, null) deletes the key', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTemplates: { reword: { ...SAMPLE_TEMPLATE }, translate: { ...SAMPLE_TEMPLATE } },
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskTemplate('reword', null);

      expect('reword' in current().advanced.taskTemplates).toBe(false);
      expect('translate' in current().advanced.taskTemplates).toBe(true);
    });

    it('setTaskBackend empty string deletes the key', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskBackend('translate', 'anthropic');
      expect(current().taskBackends['translate']).toBe('anthropic');

      await handlers.setTaskBackend('translate', '');
      expect('translate' in current().taskBackends).toBe(false);
    });

    it('undoRecipeApply called twice is idempotent on the snapshot content', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const recipe: Recipe = {
        id: 'r-undo-2x',
        task: 'translate',
        label: 'undo-twice',
        description: '',
        rules: [{ body: 'A rule.', category: 'always' }],
        generationParams: { temperature: 0.9 },
      };

      const snap = await handlers.applyRecipeFull(recipe);
      await handlers.undoRecipeApply(snap);
      const afterFirstUndo = {
        rules: current().advanced.rules.length,
        temp: current().taskTemperatures,
      };

      await handlers.undoRecipeApply(snap);

      expect(current().advanced.rules.length).toBe(afterFirstUndo.rules);
    });

    it('undoRecipeApply reports whether the restore write landed', async () => {
      const { ctx } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const toast = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
      const recipe: Recipe = {
        id: 'r-undo-report',
        task: 'translate',
        label: 'undo-report',
        description: '',
        generationParams: { temperature: 0.9 },
      };
      const snap = await handlers.applyRecipeFull(recipe);

      const set = vi
        .spyOn(chromeMock.storage.local, 'set')
        .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
      try {
        await expect(handlers.undoRecipeApply(snap)).resolves.toBe(false);
      } finally {
        set.mockRestore();
      }

      await expect(handlers.undoRecipeApply(snap)).resolves.toBe(true);
      toast.mockRestore();
    });
  });

  // Mutation-invariant discipline: cap edges — setCustomSlotDescription must enforce
  // the 50-entry limit; new keys beyond cap are silently rejected.
  describe('cap edges — setCustomSlotDescription', () => {
    it('at cap (50 entries), adding a NEW key is a no-op', async () => {
      const full: Record<string, string> = {};
      for (let i = 0; i < 50; i++) full[`slot${i}`] = `desc${i}`;
      const { ctx, current } = await makeCtx({
        advanced: { ...DEFAULT_SETTINGS.advanced, customSlotDescriptions: full },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setCustomSlotDescription('newKey', 'should be rejected');

      expect('newKey' in current().advanced.customSlotDescriptions).toBe(false);
      expect(Object.keys(current().advanced.customSlotDescriptions)).toHaveLength(50);
    });

    it('at cap (50 entries), updating an EXISTING key still succeeds', async () => {
      const full: Record<string, string> = {};
      for (let i = 0; i < 50; i++) full[`slot${i}`] = `desc${i}`;
      const { ctx, current } = await makeCtx({
        advanced: { ...DEFAULT_SETTINGS.advanced, customSlotDescriptions: full },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setCustomSlotDescription('slot0', 'updated');

      expect(current().advanced.customSlotDescriptions['slot0']).toBe('updated');
    });

    it('under cap (49 entries), adding a new key is allowed', async () => {
      const nearly: Record<string, string> = {};
      for (let i = 0; i < 49; i++) nearly[`slot${i}`] = `desc${i}`;
      const { ctx, current } = await makeCtx({
        advanced: { ...DEFAULT_SETTINGS.advanced, customSlotDescriptions: nearly },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setCustomSlotDescription('newKey', 'allowed');

      expect(current().advanced.customSlotDescriptions['newKey']).toBe('allowed');
      expect(Object.keys(current().advanced.customSlotDescriptions)).toHaveLength(50);
    });
  });

  // Handlers read-modify-write, so interleaved tasks must not drop each other's keys.
  describe('composition — sibling-task isolation', () => {
    it('setTaskTone on task A does not wipe task B tone', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTones: { translate: 'casual', reword: 'formal' },
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskTone('translate', 'blunt');

      expect(current().advanced.taskTones['reword']).toBe('formal');
      expect(current().advanced.taskTones['translate']).toBe('blunt');
    });

    it('setTaskTemplate on task A does not wipe task B template', async () => {
      const tplB: PromptTemplate = { system: 'B sys', user: 'B {{text}}' };
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTemplates: { reword: { ...SAMPLE_TEMPLATE }, translate: { ...tplB } },
        },
      });
      const handlers = createTemplatesHandlers(ctx);
      const newTpl: PromptTemplate = { system: 'NEW', user: 'NEW {{text}}' };

      await handlers.setTaskTemplate('reword', newTpl);

      expect(current().advanced.taskTemplates['translate']).toEqual(tplB);
      expect(current().advanced.taskTemplates['reword']).toEqual(newTpl);
    });

    it('appendHeaderRule does not affect unrelated existing rules', async () => {
      const existingRule = {
        id: 'orig',
        body: 'Original.',
        category: 'always' as const,
        scope: { tasks: [] as Task[] },
        source: 'manual' as const,
        addedAt: new Date().toISOString(),
        enabled: true,
      };
      const { ctx, current } = await makeCtx({
        advanced: { ...DEFAULT_SETTINGS.advanced, rules: [existingRule] },
      });
      const handlers = createTemplatesHandlers(ctx);
      const newRule = { ...existingRule, id: 'appended', body: 'Appended.' };

      await handlers.appendHeaderRule(newRule);

      const rules = current().advanced.rules;
      expect(rules).toHaveLength(2);
      expect(rules[0]?.id).toBe('orig');
      expect(rules[1]?.id).toBe('appended');
    });
  });

  // Mutation-invariant discipline: post-error state — handlers with no ctx.getSettings()
  // (null) must be safe no-ops and leave storage untouched.
  describe('post-error state — null settings guard', () => {
    function makeNullCtx() {
      return {
        getSettings: () => null as Settings | null,
        setSettings: (_n: Settings) => {},
      };
    }

    it('setTaskTemplate with null ctx is a no-op', async () => {
      const handlers = createTemplatesHandlers(makeNullCtx());
      await expect(handlers.setTaskTemplate('translate', SAMPLE_TEMPLATE)).resolves.toBeUndefined();
    });

    it('setTaskBackend with null ctx is a no-op', async () => {
      const handlers = createTemplatesHandlers(makeNullCtx());
      await expect(handlers.setTaskBackend('translate', 'anthropic')).resolves.toBeUndefined();
    });

    it('appendHeaderRule with null ctx is a no-op', async () => {
      const handlers = createTemplatesHandlers(makeNullCtx());
      const rule = {
        id: 'r',
        body: 'b',
        category: 'always' as const,
        scope: { tasks: [] as Task[] },
        source: 'manual' as const,
        addedAt: '',
        enabled: true,
      };
      await expect(handlers.appendHeaderRule(rule)).resolves.toBeUndefined();
    });

    it('applyRecipeFull with null ctx rejects instead of handing back an empty snapshot', async () => {
      const handlers = createTemplatesHandlers(makeNullCtx());
      const recipe: Recipe = { id: 'r', task: 'translate', label: '', description: '' };
      await expect(handlers.applyRecipeFull(recipe)).rejects.toThrow();
    });
  });

  // Mutation-invariant discipline: reversibility — deleteUserRecipe on a non-existent
  // id must be a safe no-op (idempotent delete).
  describe('deleteUserRecipe — idempotent delete', () => {
    it('deleting a non-existent id leaves the list unchanged', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          userRecipes: [
            { id: 'r-keep', task: 'translate', label: 'a', description: '' },
          ] as unknown as Settings['advanced']['userRecipes'],
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.deleteUserRecipe('no-such-id');

      expect((current().advanced.userRecipes as readonly Recipe[]).map((r) => r.id)).toEqual([
        'r-keep',
      ]);
    });

    it('deleting the same id twice is safe (second call is no-op)', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          userRecipes: [
            { id: 'r-drop', task: 'translate', label: 'a', description: '' },
            { id: 'r-keep', task: 'reword', label: 'b', description: '' },
          ] as unknown as Settings['advanced']['userRecipes'],
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.deleteUserRecipe('r-drop');
      await handlers.deleteUserRecipe('r-drop');

      expect((current().advanced.userRecipes as readonly Recipe[]).map((r) => r.id)).toEqual([
        'r-keep',
      ]);
    });
  });

  // Mutation-invariant discipline: append semantics — importRecipe is append-like,
  // NOT idempotent. Calling twice adds two entries (each with a distinct generated id).
  describe('importRecipe — append semantics', () => {
    it('importing same encoded recipe twice adds two entries (non-dedup append)', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const source: Recipe = {
        id: 'will-be-replaced',
        task: 'explain',
        label: 'Twice',
        description: '',
      };
      const encoded = (await import('@/shared/recipes')).serialiseRecipe(source);

      await handlers.importRecipe(encoded);
      await handlers.importRecipe(encoded);

      const list = current().advanced.userRecipes as readonly Recipe[];
      expect(list).toHaveLength(2);
      expect(list[0]?.id).not.toBe(list[1]?.id);
      expect(list[0]?.label).toBe('Twice');
    });
  });
  describe('setCustomSlotDescription — writer caps', () => {
    it('clamps a description past the stored cap instead of persisting it', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setCustomSlotDescription('tone', 'x'.repeat(SLOT_DESCRIPTION_MAX + 50));

      expect(current().advanced.customSlotDescriptions['tone']).toHaveLength(SLOT_DESCRIPTION_MAX);
    });

    it('refuses a new slot past the entry cap and says why', async () => {
      const full: Record<string, string> = {};
      for (let i = 0; i < CUSTOM_SLOTS_MAX; i += 1) full[`slot${i}`] = 'd';
      const { ctx, current } = await makeCtx({
        advanced: { ...DEFAULT_SETTINGS.advanced, customSlotDescriptions: full },
      });
      const handlers = createTemplatesHandlers(ctx);
      const pushed: string[] = [];
      const spy = vi.spyOn(toastStore, 'push').mockImplementation((m) => {
        pushed.push(m.message);
      });

      await handlers.setCustomSlotDescription('oneTooMany', 'd');

      expect(Object.keys(current().advanced.customSlotDescriptions)).toHaveLength(CUSTOM_SLOTS_MAX);
      expect(pushed[0]).toMatch(/50/);
      spy.mockRestore();
    });
  });

  describe('a storage write that fails', () => {
    it('says the change was not saved and leaves the shown settings alone', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const before = current().advanced.promptTemplate;
      const pushed: string[] = [];
      const toast = vi.spyOn(toastStore, 'push').mockImplementation((m) => {
        pushed.push(m.message);
      });
      const set = vi
        .spyOn(chromeMock.storage.local, 'set')
        .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

      await handlers.saveGlobalTemplate(SAMPLE_TEMPLATE);

      expect(pushed[0]).toMatch(/Storage is full/i);
      expect(current().advanced.promptTemplate).toEqual(before);
      set.mockRestore();
      toast.mockRestore();
    });

    it('a failed rule write does not report the new rule list', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const toast = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
      const set = vi
        .spyOn(chromeMock.storage.local, 'set')
        .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

      await handlers.updateRules([
        {
          id: 'r-1',
          body: 'keep it short',
          category: 'always',
          scope: { tasks: ['translate'] },
          source: 'manual',
          addedAt: new Date().toISOString(),
          enabled: true,
        },
      ]);

      expect(current().advanced.rules).toHaveLength(0);
      set.mockRestore();
      toast.mockRestore();
    });

    it('a recipe apply whose read never lands rejects, so no undo snapshot exists', async () => {
      const { ctx, current } = await makeCtx({
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          taskTemplates: { reword: { ...SAMPLE_TEMPLATE } },
          taskTones: { reword: 'formal' },
        },
        taskTemperatures: { reword: 0.3 },
      });
      const handlers = createTemplatesHandlers(ctx);
      const toast = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
      const get = vi
        .spyOn(chromeMock.storage.local, 'get')
        .mockRejectedValue(new Error('disk i/o failed'));
      const recipe: Recipe = {
        id: 'r-fail',
        task: 'reword',
        label: 'Fails',
        description: '',
        template: { system: 'NEW', user: 'NEW {{text}}' },
        generationParams: { temperature: 0.9, tone: 'blunt' },
      };

      try {
        await expect(handlers.applyRecipeFull(recipe)).rejects.toThrow();
      } finally {
        get.mockRestore();
      }

      expect(current().advanced.taskTemplates['reword']).toEqual(SAMPLE_TEMPLATE);
      expect(current().advanced.taskTones['reword']).toBe('formal');
      expect(current().taskTemperatures?.['reword']).toBe(0.3);
      toast.mockRestore();
    });

    it('a recipe apply whose write never lands rejects', async () => {
      const { ctx } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const toast = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
      const set = vi
        .spyOn(chromeMock.storage.local, 'set')
        .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

      try {
        await expect(
          handlers.applyRecipeFull({
            id: 'r-quota',
            task: 'reword',
            label: 'Quota',
            description: '',
            template: { system: 'NEW', user: 'NEW {{text}}' },
          }),
        ).rejects.toThrow();
      } finally {
        set.mockRestore();
      }

      toast.mockRestore();
    });
  });
});
