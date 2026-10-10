import { describe, it, expect, vi } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import { CARD_CONTRACT, PLAIN_CONTRACT } from '@/shared/answer/formats-v1';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { mkSettings, baseDeps } from '@tests/_helpers/router';
import type { Task } from '@/shared/task-prompts';
import type { TranslationChunk } from '@/shared/types';

describe('router — a task this build cannot run', () => {
  it.each(['summarize', 'c-off'])(
    'refuses a turned-off task %s before contacting a backend',
    async (task) => {
      const translate = vi.fn();
      const backend: TranslationBackend = {
        id: asBackendIdUnsafe('anthropic'),
        manifest: testManifest('anthropic'),
        isAvailable: async () => true,
        translate,
      };
      const chunks: TranslationChunk[] = [];
      await createRouter(
        baseDeps({
          backends: [backend],
          getSettings: async () => mkSettings({ disabledTasks: [task] }),
          getCustomTasks: async () => [
            {
              id: 'c-off',
              label: 'Off',
              system: '',
              user: '{{text}}',
              output: 'plain',
              pageContext: false,
              image: false,
              glossary: false,
              createdAt: 1,
            },
          ],
        }),
      ).handleTranslate(
        {
          id: 'off',
          text: 'hello',
          sourceLang: sel('en'),
          targetLang: sel('ar'),
          options: { stream: false, explain: false, task },
        },
        (c) => chunks.push(c),
      );
      expect(chunks).toEqual([
        {
          type: 'error',
          requestId: 'off',
          code: 'REQUEST',
          message: 'This task is turned off. Turn it on in Settings → Tasks, or pick another task.',
        },
      ]);
      expect(translate).not.toHaveBeenCalled();
    },
  );
  it('answers with a request error that points at no setting, and calls no backend', async () => {
    const translate = vi.fn();
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(
      baseDeps({ backends: [backend], getSettings: async () => mkSettings() }),
    ).handleTranslate(
      {
        id: 'r1',
        text: 'hello',
        sourceLang: sel('en'),
        targetLang: sel('ar'),
        // A deleted custom task's id, as an old turn or a hand-made message would send it.
        options: { stream: false, explain: false, task: 'gone-task' as Task },
      },
      (c) => chunks.push(c),
    );
    expect(chunks).toEqual([
      {
        type: 'error',
        requestId: 'r1',
        code: 'REQUEST',
        message: 'This task no longer exists. Pick another task.',
      },
    ]);
    expect(translate).not.toHaveBeenCalled();
  });
});

describe('router — a custom task', () => {
  const tweet = {
    id: 'c-tweet',
    label: 'Tweet summary',
    system: 'Summarize as one tweet.',
    user: 'TEXT: {{text}}',
    output: 'card' as const,
    pageContext: false,
    image: false,
    glossary: false,
    effort: 'high' as const,
    createdAt: 1,
  };

  it('runs its own prompt with the card contract and its own effort', async () => {
    const calls: TranslateCallArgs[] = [];
    const translate = vi.fn(async (args: TranslateCallArgs) => {
      calls.push(args);
      args.onChunk({ type: 'delta', requestId: args.req.id, text: '{"translation":"short"}' });
      args.onChunk({ type: 'done', requestId: args.req.id });
    });
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(
      baseDeps({
        backends: [backend],
        getSettings: async () => mkSettings(),
        getCustomTasks: async () => [tweet],
      }),
    ).handleTranslate(
      {
        id: 'r2',
        text: 'a long thread',
        sourceLang: sel('en'),
        targetLang: sel('en'),
        options: { stream: false, explain: false, task: 'c-tweet' },
      },
      (c) => chunks.push(c),
    );
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(translate).toHaveBeenCalledTimes(1);
    const call = calls[0];
    expect(call?.system).toContain('Summarize as one tweet.');
    expect(call?.system).toContain(CARD_CONTRACT);
    expect(call?.user).toContain('TEXT: a long thread');
    expect(call?.config.advanced.effort).toBe('high');
  });
});

describe('router — the contract line', () => {
  it('a built-in task never gets one', async () => {
    const calls: TranslateCallArgs[] = [];
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: vi.fn(async (args: TranslateCallArgs) => {
        calls.push(args);
        args.onChunk({ type: 'done', requestId: args.req.id });
      }),
    };
    await createRouter(
      baseDeps({ backends: [backend], getSettings: async () => mkSettings() }),
    ).handleTranslate(
      {
        id: 'r3',
        text: 'a long thread',
        sourceLang: sel('en'),
        targetLang: sel('en'),
        options: { stream: false, explain: false, task: 'summarize' },
      },
      () => {},
    );
    expect(calls[0]?.system).not.toContain(PLAIN_CONTRACT);
    expect(calls[0]?.system).not.toContain(CARD_CONTRACT);
  });
});

describe('router — a custom task reads its own switches', () => {
  const base = {
    id: 'c-x',
    label: 'X',
    system: 'Do X. @@lead@@',
    user: '{{text}}',
    output: 'plain' as const,
    pageContext: false,
    image: false,
    glossary: false,
    createdAt: 1,
  };

  async function run(
    row: typeof base,
    settings = mkSettings(),
    context = false,
  ): Promise<TranslateCallArgs> {
    const calls: TranslateCallArgs[] = [];
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: vi.fn(async (args: TranslateCallArgs) => {
        calls.push(args);
        args.onChunk({ type: 'done', requestId: args.req.id });
      }),
    };
    await createRouter(
      baseDeps({
        backends: [backend],
        getSettings: async () => settings,
        getCustomTasks: async () => [row],
      }),
    ).handleTranslate(
      {
        id: 'rx',
        text: 'the fox runs',
        sourceLang: sel('en'),
        targetLang: sel('es'),
        ...(context ? { context: { pageTitle: 'Page Title Z' } } : {}),
        options: { stream: false, explain: false, task: 'c-x' },
      },
      () => {},
    );
    const call = calls[0];
    if (!call) throw new Error('no backend call');
    return call;
  }

  it('plain output gets the plain contract only', async () => {
    const call = await run(base);
    expect(call.system).toContain(PLAIN_CONTRACT);
    expect(call.system).not.toContain(CARD_CONTRACT);
  });

  it('snippets stay literal in a custom prompt', async () => {
    const s = mkSettings();
    const call = await run(base, {
      ...s,
      advanced: { ...s.advanced, snippets: { lead: 'EXPANDED' } },
    });
    expect(call.system).toContain('@@lead@@');
    expect(call.system).not.toContain('EXPANDED');
  });

  it('page context goes in only when the row takes it', async () => {
    expect((await run(base, mkSettings(), true)).user).not.toContain('Page Title Z');
    expect((await run({ ...base, pageContext: true }, mkSettings(), true)).user).toContain(
      'Page Title Z',
    );
  });

  it('the glossary goes in only when the row takes it', async () => {
    const s = mkSettings({
      glossary: [{ term: 'fox', translation: 'zorro', caseSensitive: false }],
    });
    expect((await run(base, s)).system).not.toContain('zorro');
    expect((await run({ ...base, glossary: true }, s)).system).toContain('zorro');
  });

  it('a custom task deleted after the request was sent gets the "no longer exists" error', async () => {
    const chunks: TranslationChunk[] = [];
    await createRouter(
      baseDeps({ getSettings: async () => mkSettings(), getCustomTasks: async () => [] }),
    ).handleTranslate(
      {
        id: 'ry',
        text: 'x',
        sourceLang: sel('en'),
        targetLang: sel('es'),
        options: { stream: false, explain: false, task: 'c-x' },
      },
      (c) => chunks.push(c),
    );
    expect(chunks).toEqual([
      {
        type: 'error',
        requestId: 'ry',
        code: 'REQUEST',
        message: 'This task no longer exists. Pick another task.',
      },
    ]);
  });
});

describe('router — a failed custom-task read', () => {
  it('does not fail a built-in request', async () => {
    const calls: TranslateCallArgs[] = [];
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: vi.fn(async (args: TranslateCallArgs) => {
        calls.push(args);
        args.onChunk({ type: 'done', requestId: args.req.id });
      }),
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(
      baseDeps({
        backends: [backend],
        getSettings: async () => mkSettings(),
        getCustomTasks: () => Promise.reject(new Error('storage down')),
      }),
    ).handleTranslate(
      {
        id: 'rz',
        text: 'x',
        sourceLang: sel('en'),
        targetLang: sel('es'),
        options: { stream: false, explain: false, task: 'summarize' },
      },
      (c) => chunks.push(c),
    );
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
