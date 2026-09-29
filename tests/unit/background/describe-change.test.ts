import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Settings } from '@/shared/types';
import type { BackendConfig, TranslationBackend, TranslateCallArgs } from '@/shared/backends/base';
import { MAX_DESCRIBE_INPUT_CHARS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { testManifest } from '@tests/_helpers/backend';

const mockBackends: { byId: Map<string, TranslationBackend> } = { byId: new Map() };
const mockChain: { ids: string[] } = { ids: ['mock'] };

vi.mock('@/shared/backends/registry', () => ({
  resolveBackend: (id: string): TranslationBackend | null => mockBackends.byId.get(id) ?? null,
  getRegisteredBackendIds: (): readonly string[] => Array.from(mockBackends.byId.keys()),
}));

vi.mock('@/shared/backends/select', () => ({
  computeBackendOrder: (): string[] => [...mockChain.ids],
}));

import { describeChange } from '@/background/describe-change';
import { swKeepaliveState } from '@/background/swKeepalive.test-utils';

function settings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

function config(): BackendConfig {
  return {
    apiKeys: {},
    model: DEFAULT_SETTINGS.model,
    advanced: {
      promptTemplate: DEFAULT_SETTINGS.advanced.promptTemplate,
      perPresetTemplates: DEFAULT_SETTINGS.advanced.perPresetTemplates,
      temperature: 0.2,
      maxTokens: 1024,
    },
  };
}

function makeBackend(
  id: string,
  behaviour: (args: TranslateCallArgs) => void,
  opts?: { available?: boolean },
): TranslationBackend {
  return {
    id: id as TranslationBackend['id'],
    manifest: testManifest(id),
    isAvailable: async () => opts?.available ?? true,
    translate: async (args) => {
      behaviour(args);
    },
  };
}

describe('describeChange', () => {
  beforeEach(() => {
    mockBackends.byId = new Map();
    mockChain.ids = ['mock'];
  });

  it('returns parsed response when backend produces clean JSON', async () => {
    mockBackends.byId.set(
      'mock',
      makeBackend('mock', (args) => {
        args.onChunk({
          type: 'delta',
          requestId: args.req.id,
          text: '{"category":"prefer","body":"use formal tone","scope":{"tasks":["reword"]}}',
        });
        args.onChunk({
          type: 'done',
          requestId: args.req.id,
          confidence: 0.9,
        });
      }),
    );

    const result = await describeChange(
      'be more formal when rewording',
      { task: 'reword' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.category).toBe('prefer');
      expect(result.response.body).toBe('use formal tone');
      expect(result.response.scope.tasks).toEqual(['reword']);
    }
  });

  it('reads the rule a thinking model writes after its think block', async () => {
    mockBackends.byId.set(
      'mock',
      makeBackend('mock', (args) => {
        for (const text of [
          '<think>The user wants a formal tone. {"category":"never"}</thi',
          'nk>\nHere is the rule:\n',
          '{"category":"prefer","body":"use formal tone","scope":{"tasks":["reword"]}}',
        ])
          args.onChunk({ type: 'delta', requestId: args.req.id, text });
        args.onChunk({ type: 'done', requestId: args.req.id });
      }),
    );

    const result = await describeChange(
      'be more formal when rewording',
      { task: 'reword' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );

    expect(result).toEqual({
      ok: true,
      response: { category: 'prefer', body: 'use formal tone', scope: { tasks: ['reword'] } },
    });
  });

  it('returns parse failed when the backend returns gibberish', async () => {
    mockBackends.byId.set(
      'mock',
      makeBackend('mock', (args) => {
        args.onChunk({
          type: 'delta',
          requestId: args.req.id,
          text: 'this is not json at all, just a sentence',
        });
        args.onChunk({
          type: 'done',
          requestId: args.req.id,
          confidence: 0.5,
        });
      }),
    );

    const result = await describeChange(
      'something',
      { task: 'global' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('parse failed');
  });

  it('returns all backends unavailable when isAvailable is false everywhere', async () => {
    mockBackends.byId.set(
      'mock',
      makeBackend('mock', () => {}, { available: false }),
    );

    const result = await describeChange(
      'whatever',
      { task: 'global' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('all backends unavailable');
  });

  it('returns no backend available when the chain is empty', async () => {
    mockChain.ids = [];
    const result = await describeChange(
      'whatever',
      { task: 'global' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no backend available');
  });

  it('walks past a parse-failing backend to the next clean one', async () => {
    // A returns gibberish and B valid JSON: the chain must move on to B.
    mockBackends.byId.set(
      'a',
      makeBackend('a', (args) => {
        args.onChunk({ type: 'delta', requestId: args.req.id, text: 'not json' });
        args.onChunk({ type: 'done', requestId: args.req.id, confidence: 0.1 });
      }),
    );
    mockBackends.byId.set(
      'b',
      makeBackend('b', (args) => {
        args.onChunk({
          type: 'delta',
          requestId: args.req.id,
          text: '{"category":"always","body":"keep it casual","scope":{"tasks":["reword"]}}',
        });
        args.onChunk({ type: 'done', requestId: args.req.id, confidence: 0.95 });
      }),
    );
    mockChain.ids = ['a', 'b'];

    const result = await describeChange(
      'be casual',
      { task: 'reword' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.category).toBe('always');
      expect(result.response.body).toBe('keep it casual');
    }
  });

  it('stops after 1 + retryCount backends that actually answered', async () => {
    const tried: string[] = [];
    for (const id of ['a', 'b', 'c', 'd']) {
      mockBackends.byId.set(
        id,
        makeBackend(id, (args) => {
          tried.push(id);
          args.onChunk({ type: 'delta', requestId: args.req.id, text: 'not json' });
          args.onChunk({ type: 'done', requestId: args.req.id, confidence: 0.1 });
        }),
      );
    }
    mockChain.ids = ['a', 'b', 'c', 'd'];

    const s = settings();
    const result = await describeChange(
      'be casual',
      { task: 'reword' },
      { settings: s, config: config(), timeoutMs: 5000 },
    );

    expect(result.ok).toBe(false);
    expect(tried).toEqual(['a', 'b'].slice(0, 1 + s.advanced.retryCount));
  });

  it('an unconfigured backend does not spend the attempt budget', async () => {
    const tried: string[] = [];
    const gibberish = (id: string) =>
      makeBackend(id, (args) => {
        tried.push(id);
        args.onChunk({ type: 'delta', requestId: args.req.id, text: 'not json' });
        args.onChunk({ type: 'done', requestId: args.req.id, confidence: 0.1 });
      });
    mockBackends.byId.set(
      'off1',
      makeBackend('off1', () => {}, { available: false }),
    );
    mockBackends.byId.set(
      'off2',
      makeBackend('off2', () => {}, { available: false }),
    );
    mockBackends.byId.set('a', gibberish('a'));
    mockBackends.byId.set('b', gibberish('b'));
    mockChain.ids = ['off1', 'off2', 'a', 'b'];

    await describeChange(
      'be casual',
      { task: 'reword' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );

    expect(tried).toEqual(['a', 'b']);
  });

  it('caps user input at MAX_DESCRIBE_INPUT_CHARS before issuing the request', async () => {
    let seenText = '';
    mockBackends.byId.set(
      'mock',
      makeBackend('mock', (args) => {
        seenText = args.req.text;
        args.onChunk({
          type: 'delta',
          requestId: args.req.id,
          text: '{"category":"prefer","body":"x","scope":{"tasks":["reword"]}}',
        });
        args.onChunk({ type: 'done', requestId: args.req.id, confidence: 0.9 });
      }),
    );

    const bigInput = 'a'.repeat(MAX_DESCRIBE_INPUT_CHARS + 500);
    const result = await describeChange(
      bigInput,
      { task: 'reword' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );

    expect(result.ok).toBe(true);
    expect(seenText.length).toBeLessThanOrEqual(MAX_DESCRIBE_INPUT_CHARS);
    expect(seenText.length).toBe(MAX_DESCRIBE_INPUT_CHARS);
  });

  it('holds a SW keepalive for the duration of the call and releases after', async () => {
    let midCall: { active: boolean; inflight: number } | undefined;
    mockBackends.byId.set(
      'mock',
      makeBackend('mock', (args) => {
        midCall = swKeepaliveState();
        args.onChunk({
          type: 'delta',
          requestId: args.req.id,
          text: '{"category":"prefer","body":"x","scope":{"tasks":["reword"]}}',
        });
        args.onChunk({ type: 'done', requestId: args.req.id, confidence: 0.9 });
      }),
    );

    await describeChange(
      'x',
      { task: 'reword' },
      { settings: settings(), config: config(), timeoutMs: 5000 },
    );

    expect(midCall).toEqual({ active: true, inflight: 1 });
    expect(swKeepaliveState()).toEqual({ active: false, inflight: 0 });
  });

  it('a backend that ignores its AbortSignal cannot strand the call past the attempt budget', async () => {
    mockBackends.byId.set('mock', {
      id: 'mock' as TranslationBackend['id'],
      manifest: testManifest('mock'),
      isAvailable: async () => true,
      // Never resolves and never honors cancel — the race on cancel.signal must unblock the walk.
      translate: () => new Promise<void>(() => {}),
    } as TranslationBackend);

    const result = await describeChange(
      'x',
      { task: 'global' },
      { settings: settings(), config: config(), timeoutMs: 100 },
    );

    expect(result.ok).toBe(false);
    expect(swKeepaliveState()).toEqual({ active: false, inflight: 0 });
  }, 4000);
});

// A rule is not a translation, so the shared terminal would call every reply an empty answer
// and the options page would silently fall back to the user's raw text.
it('asks the backend for the model text as-is', async () => {
  const seen: Array<boolean | undefined> = [];
  mockBackends.byId.set(
    'mock',
    makeBackend('mock', (args) => {
      seen.push(args.rawAnswer);
      args.onChunk({
        type: 'delta',
        requestId: args.req.id,
        text: '{"category":"always","body":"keep emoji","scope":{"tasks":[]}}',
      });
      args.onChunk({ type: 'done', requestId: args.req.id, confidence: 1 });
    }),
  );

  const result = await describeChange(
    'keep emoji',
    { task: 'global' },
    { settings: settings(), config: config(), timeoutMs: 100 },
  );

  expect(seen).toEqual([true]);
  expect(result.ok).toBe(true);
});
