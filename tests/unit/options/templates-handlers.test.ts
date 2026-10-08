import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { toastStore } from '@/shared/components/toastStore';
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

// Spec 3.0, R1-01: a write that does not land hands the stored settings back, as a new object,
// so a slider or box the user moved goes back to the stored value.
describe('templates-handlers — a write that does not land', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('patchAdvanced hands the page the stored settings again', async () => {
    const { ctx, current } = await makeCtx();
    const before = current();
    const handlers = createTemplatesHandlers(ctx);
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('disk full'));
    await handlers.setGlobalTemperature(0.9);
    expect(current()).not.toBe(before);
    expect(current().advanced.temperature).toBe(before.advanced.temperature);
  });
});
