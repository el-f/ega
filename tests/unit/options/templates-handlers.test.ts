import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';
import { getSettings } from '@/shared/storage';
import { createTemplatesHandlers } from '@/options/templates-handlers';
import type { Settings, PromptTemplate } from '@/shared/types';

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

  describe('setGlobalEffort', () => {
    it('patches advanced.effort', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setGlobalEffort('high');

      expect(current().advanced.effort).toBe('high');
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

    it('savePerPreset of the Translate prompt itself stores no language prompt', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      await handlers.savePerPreset('arabizi', { system: 'own', user: '{{text}}' });
      await handlers.savePerPreset('arabizi', { ...current().advanced.promptTemplate });
      expect(current().advanced.perPresetTemplates).not.toHaveProperty('arabizi');
    });

    it('savePerPreset stores only the half that differs from the Translate prompt', async () => {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      const global = current().advanced.promptTemplate;
      await handlers.savePerPreset('arabizi', { system: 'own', user: global.user });
      const stored = await readStored();
      expect(stored.advanced.perPresetTemplates['arabizi']).toEqual({ system: 'own' });
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

    it('setTaskTemplate(task, null) drops the prompt halves and keeps the other fields', async () => {
      const { ctx, current } = await makeCtx({
        taskOverrides: {
          reword: { ...SAMPLE_TEMPLATE },
          grammar: { ...SAMPLE_TEMPLATE, effort: 'high' },
          summarize: { ...SAMPLE_TEMPLATE },
        },
      });
      const handlers = createTemplatesHandlers(ctx);

      await handlers.setTaskTemplate('reword', null);
      await handlers.setTaskTemplate('grammar', null);

      expect(current().taskOverrides).toEqual({
        grammar: { effort: 'high' },
        summarize: SAMPLE_TEMPLATE,
      });
      expect((await readStored()).taskOverrides).toEqual(current().taskOverrides);
    });
  });

  // Mutation-invariant discipline: cap edges — setCustomSlotDescription must enforce
  // the 50-entry limit; new keys beyond cap are silently rejected.
  // Handlers read-modify-write, so interleaved tasks must not drop each other's keys.
  describe('composition — sibling-task isolation', () => {
    it('setTaskTemplate on task A does not wipe task B template', async () => {
      const tplB: PromptTemplate = { system: 'B sys', user: 'B {{text}}' };
      const { ctx, current } = await makeCtx({
        taskOverrides: { reword: { ...SAMPLE_TEMPLATE }, grammar: { ...tplB } },
      });
      const handlers = createTemplatesHandlers(ctx);
      const newTpl: PromptTemplate = { system: 'NEW', user: 'NEW {{text}}' };

      await handlers.setTaskTemplate('reword', newTpl);

      expect(current().taskOverrides.grammar).toEqual(tplB);
      expect(current().taskOverrides.reword).toEqual(newTpl);
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
  });

  describe('clearPerPreset offers Undo', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function clearWithToasts(
      seed: Record<string, PromptTemplate>,
      presetId: string,
    ): Promise<{
      pushed: ToastMsg[];
      handlers: ReturnType<typeof createTemplatesHandlers>;
      current: () => Settings;
    }> {
      const { ctx, current } = await makeCtx();
      const handlers = createTemplatesHandlers(ctx);
      for (const [id, tpl] of Object.entries(seed)) await handlers.savePerPreset(id, tpl);
      const pushed: ToastMsg[] = [];
      vi.spyOn(toastStore, 'push').mockImplementation((m) => {
        pushed.push(m);
      });
      await handlers.clearPerPreset(presetId);
      return { pushed, handlers, current };
    }

    it('Undo writes the cleared language prompt back', async () => {
      const { pushed, current } = await clearWithToasts(
        { arabizi: { system: 'S', user: 'U' } },
        'arabizi',
      );
      expect('arabizi' in current().advanced.perPresetTemplates).toBe(false);
      const undo = pushed.find((m) => m.action?.label === 'Undo');
      expect(undo?.message).toMatch(/prompt cleared/i);
      undo?.action?.onClick();
      await vi.waitFor(async () =>
        expect((await readStored()).advanced.perPresetTemplates['arabizi']).toEqual({
          system: 'S',
          user: 'U',
        }),
      );
      expect(current().advanced.perPresetTemplates['arabizi']).toEqual({ system: 'S', user: 'U' });
    });

    it('Undo keeps a prompt saved for another language since the clear', async () => {
      const { pushed, handlers } = await clearWithToasts(
        { arabizi: { system: 'S', user: 'U' } },
        'arabizi',
      );
      await handlers.savePerPreset('egyptian', { system: 'E', user: 'U2' });
      pushed.find((m) => m.action?.label === 'Undo')?.action?.onClick();
      await vi.waitFor(async () =>
        expect(Object.keys((await readStored()).advanced.perPresetTemplates).sort()).toEqual([
          'arabizi',
          'egyptian',
        ]),
      );
    });

    it('a language with no prompt of its own shows no Undo', async () => {
      const { pushed } = await clearWithToasts({}, 'arabizi');
      expect(pushed.filter((m) => m.action !== undefined)).toEqual([]);
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

      const ok = await handlers.updateRules([
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

      expect(ok).toBe(false);
      expect(current().advanced.rules).toHaveLength(0);
      set.mockRestore();
      toast.mockRestore();
    });
  });
});
