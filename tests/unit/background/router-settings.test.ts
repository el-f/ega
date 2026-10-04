import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import { baseDeps } from '@tests/_helpers/router';
import { makeDoneChunk, type TranslationBackend } from '@/shared/backends/base';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { readAuditLog, clearAuditLog } from '@/shared/audit-log';
import type { Settings, TranslationChunk, TranslationRequest } from '@/shared/types';
import type { Rule } from '@/shared/rules';
import { resetChromeMock } from '@tests/mocks/chrome';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

beforeEach(async () => {
  resetChromeMock();
  await clearAuditLog();
});

function mkSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function okBackend(
  id: string,
  capture?: { system?: string[]; user?: string[] },
): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async ({ req, system, user, onChunk }) => {
      if (capture?.system) capture.system.push(system);
      if (capture?.user) capture.user.push(user);
      onChunk({
        type: 'delta',
        requestId: req.id,
        text: JSON.stringify({ translation: 'OK', confidence: 0.9 }),
      });
      onChunk(makeDoneChunk(req.id, { translation: 'OK', confidence: 0.9 }));
    },
  };
}

function errorBackend(id: string): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      // AUTH rotates to the next backend, but this is the only backend in
      // the chain (isLast) so the router bubbles it to the user.
      onChunk({ type: 'error', requestId: req.id, code: 'AUTH', message: 'broken' });
    },
  };
}

const baseReq: TranslationRequest = {
  id: 'req-09',
  text: 'salam',
  sourceLang: sel('arabizi'),
  targetLang: sel('en'),
  options: { stream: true, explain: false },
};

describe('router — audit log entries', () => {
  it('writes an audit entry after a successful translate', async () => {
    const router = createRouter(
      baseDeps({
        backends: [okBackend('anthropic')],
        getSettings: async () => mkSettings({ cacheEnabled: false, anthropicApiKey: 'k' }),
      }),
    );
    await router.handleTranslate({ ...baseReq, id: 'a-ok' }, () => {});
    // Audit writes are fire-and-forget — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    const entry = log[0];
    if (!entry) throw new Error('audit entry missing');
    expect(entry.task).toBe('translate');
    expect(entry.backend).toBe('anthropic');
    expect(entry.cacheHit).toBe(false);
    expect(entry.error).toBeUndefined();
    expect(entry.response).toBe('OK');
    expect(entry.confidence).toBe(0.9);
    expect(entry.systemPrompt.length).toBeGreaterThan(0);
    expect(entry.userPrompt.length).toBeGreaterThan(0);
  });

  it('writes an audit entry after a final error', async () => {
    const router = createRouter(
      baseDeps({
        backends: [errorBackend('anthropic')],
        getSettings: async () => mkSettings({ cacheEnabled: false, anthropicApiKey: 'k' }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate({ ...baseReq, id: 'a-err' }, (c) => chunks.push(c));
    await Promise.resolve();
    await Promise.resolve();
    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    const entry = log[0];
    if (!entry) throw new Error('audit entry missing');
    expect(entry.error).toBeDefined();
    expect(entry.error?.code).toBe('AUTH');
    expect(entry.response).toBe('');
  });

  it('audit-log write failure does not break the user-visible request', async () => {
    // Force chrome.storage.local.set to throw.
    const origSet = chrome.storage.local.set;
    (chrome.storage.local as unknown as { set: (i: unknown) => Promise<void> }).set = () =>
      Promise.reject(new Error('storage exploded'));
    try {
      const router = createRouter(
        baseDeps({
          backends: [okBackend('anthropic')],
          getSettings: async () => mkSettings({ cacheEnabled: false, anthropicApiKey: 'k' }),
        }),
      );
      const chunks: TranslationChunk[] = [];
      await router.handleTranslate({ ...baseReq, id: 'a-throw' }, (c) => chunks.push(c));
      // Done chunk must still arrive even though audit write failed.
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    } finally {
      (chrome.storage.local as unknown as { set: typeof origSet }).set = origSet;
    }
  });
});

describe('router — retry chain', () => {
  it('retryCount=0 caps the chain at the primary attempt', async () => {
    const calls: string[] = [];
    const a: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        calls.push('anthropic');
        onChunk({ type: 'error', requestId: req.id, code: 'RATE_LIMIT', message: 'slow' });
      },
    };
    const o = okBackend('openai');
    const oSpy = vi.spyOn(o, 'translate');
    const router = createRouter(
      baseDeps({
        backends: [a, o],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            openaiApiKey: 'sk-test',
            backendOrder: ['anthropic', 'openai'].map(bid),
            disabledBackends: [],
            advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 0 },
          }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate({ ...baseReq, id: 'retry-0' }, (c) => chunks.push(c));
    expect(calls).toEqual(['anthropic']);
    expect(oSpy).not.toHaveBeenCalled();
    expect(chunks.some((c) => c.type === 'error' && c.code === 'RATE_LIMIT')).toBe(true);
  });
});

describe('router — buildPrompt receives the reword tone', () => {
  it('reword + defaultTone=blunt renders a blunt prompt', async () => {
    const captured = { system: [] as string[], user: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            defaultTone: 'blunt',
          }),
      }),
    );
    await router.handleTranslate(
      {
        id: 'reword-blunt',
        text: 'please consider revising',
        sourceLang: sel('en'),
        targetLang: sel('en'),
        options: { stream: false, explain: false, task: 'reword' },
      },
      () => {},
    );
    expect(captured.system[0]).toMatch(/direct and blunt/);
  });

  it('options.refinement injects a request-scoped instruction into the user prompt', async () => {
    const captured = { system: [] as string[], user: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () => mkSettings({ cacheEnabled: false, anthropicApiKey: 'k' }),
      }),
    );
    await router.handleTranslate(
      {
        id: 'refine-1',
        text: 'hola',
        sourceLang: sel('es'),
        targetLang: sel('en'),
        options: { stream: false, explain: false, refinement: 'use pig latin' },
      },
      () => {},
    );
    // Refinement is per-request, so it rides the user message to keep the
    // system block a byte-stable cache prefix.
    expect(captured.user[0]).toMatch(/Refinement for this response: use pig latin/);
    expect(captured.system[0]).not.toMatch(/Refinement for this response/);
  });

  it('no refinement → no refinement line in either prompt', async () => {
    const captured = { system: [] as string[], user: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () => mkSettings({ cacheEnabled: false, anthropicApiKey: 'k' }),
      }),
    );
    await router.handleTranslate(
      {
        id: 'plain-1',
        text: 'hola',
        sourceLang: sel('es'),
        targetLang: sel('en'),
        options: { stream: false, explain: false },
      },
      () => {},
    );
    expect(captured.system[0]).not.toMatch(/Refinement for this response/);
    expect(captured.user[0]).not.toMatch(/Refinement for this response/);
  });

  it('non-reword tasks do not get a tone slot', async () => {
    const captured = { system: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            defaultTone: 'blunt',
          }),
      }),
    );
    await router.handleTranslate(
      {
        id: 'sum-1',
        text: 'long text',
        sourceLang: sel('en'),
        targetLang: sel('en'),
        options: { stream: false, explain: false, task: 'summarize' },
      },
      () => {},
    );
    // summarize template has no {{tone}} slot, and reword tone shouldn't
    // bleed in here.
    expect(captured.system[0]).not.toMatch(/direct and blunt/);
  });
});

describe('router — meta.firstTokenMs across attempt chain', () => {
  it('reports firstTokenMs measured from the completing backend', async () => {
    // The first backend fails fast; firstTokenMs must time the second backend's first delta, not the chain start.
    const failFast: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'error', requestId: req.id, code: 'RATE_LIMIT', message: 'slow' });
      },
    };
    const delayedSuccess: TranslationBackend = {
      id: bid('openai'),
      manifest: testManifest('openai'),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        // The first token takes 40 ms on the fake performance clock.
        vi.advanceTimersByTime(40);
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: JSON.stringify({ translation: 'OK', confidence: 1 }),
        });
        onChunk(makeDoneChunk(req.id, { translation: 'OK', confidence: 1 }));
      },
    };
    const router = createRouter(
      baseDeps({
        backends: [failFast, delayedSuccess],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            openaiApiKey: 'sk-test',
            backendOrder: ['anthropic', 'openai'].map(bid),
            disabledBackends: [],
            advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 2 },
          }),
      }),
    );
    const chunks: TranslationChunk[] = [];
    vi.useFakeTimers({ toFake: ['performance'] });
    try {
      await router.handleTranslate({ ...baseReq, id: 'meta-chain' }, (c) => chunks.push(c));
    } finally {
      vi.useRealTimers();
    }
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.meta?.backendId).toBe('openai');
      expect(done.meta?.firstTokenMs).toBe(40);
    }
  });
});

describe('router — the rules block goes before the system prompt', () => {
  function mkRule(overrides: Partial<Rule> = {}): Rule {
    return {
      id: 'r-test',
      body: 'Always preserve URLs verbatim.',
      category: 'always',
      scope: { tasks: [] },
      source: 'manual',
      addedAt: '2026-05-09T00:00:00.000Z',
      enabled: true,
      ...overrides,
    };
  }

  it('prepends rules block when at least one matching rule exists', async () => {
    const captured = { system: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            advanced: {
              ...DEFAULT_SETTINGS.advanced,
              rules: [mkRule({ body: 'preserve URLs verbatim.' })] as Settings['advanced']['rules'],
            },
          }),
      }),
    );
    await router.handleTranslate({ ...baseReq, id: 'rules-1' }, () => {});
    expect(captured.system[0]).toMatch(/^RULES \(apply throughout\):/);
    expect(captured.system[0]).toMatch(/Always: preserve URLs verbatim\./);
  });

  it('omits rules block when no rules match the request', async () => {
    const captured = { system: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            advanced: {
              ...DEFAULT_SETTINGS.advanced,
              // Rule is scoped to 'summarize' — current request is translate.
              rules: [mkRule({ scope: { tasks: ['summarize'] } })] as Settings['advanced']['rules'],
            },
          }),
      }),
    );
    await router.handleTranslate({ ...baseReq, id: 'rules-2' }, () => {});
    expect(captured.system[0]).not.toMatch(/RULES \(apply throughout\):/);
  });

  it('omits rules block when advanced.rules is empty', async () => {
    const captured = { system: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            advanced: { ...DEFAULT_SETTINGS.advanced, rules: [] },
          }),
      }),
    );
    await router.handleTranslate({ ...baseReq, id: 'rules-3' }, () => {});
    expect(captured.system[0]).not.toMatch(/RULES \(apply throughout\):/);
  });

  it('site-scoped rule applies when host extracted from req.context.pageUrl matches', async () => {
    const captured = { system: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            advanced: {
              ...DEFAULT_SETTINGS.advanced,
              rules: [
                mkRule({
                  body: 'break Twitter handle formatting.',
                  category: 'never',
                  scope: { tasks: [], sites: ['twitter.com'] },
                }),
              ] as Settings['advanced']['rules'],
            },
          }),
      }),
    );
    await router.handleTranslate(
      {
        ...baseReq,
        id: 'rules-site-hit',
        context: { pageUrl: 'https://twitter.com/elonmusk/status/123' },
      },
      () => {},
    );
    expect(captured.system[0]).toMatch(/Never: break Twitter handle formatting\./);
  });

  it('site-scoped rule is filtered out when host does not match', async () => {
    const captured = { system: [] as string[] };
    const a = okBackend('anthropic', captured);
    const router = createRouter(
      baseDeps({
        backends: [a],
        getSettings: async () =>
          mkSettings({
            cacheEnabled: false,
            anthropicApiKey: 'k',
            advanced: {
              ...DEFAULT_SETTINGS.advanced,
              rules: [
                mkRule({
                  body: 'break Twitter handle formatting.',
                  category: 'never',
                  scope: { tasks: [], sites: ['twitter.com'] },
                }),
              ] as Settings['advanced']['rules'],
            },
          }),
      }),
    );
    await router.handleTranslate(
      {
        ...baseReq,
        id: 'rules-site-miss',
        context: { pageUrl: 'https://example.com/post' },
      },
      () => {},
    );
    expect(captured.system[0]).not.toMatch(/RULES \(apply throughout\):/);
  });
});

describe('router — probe TTL comes from settings', () => {
  it('honors s.advanced.backendProbeTtlMs (short TTL re-probes within session)', async () => {
    const probeSpy = vi.fn(async () => true);
    const b: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: probeSpy,
      translate: async ({ req, onChunk }) => {
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: JSON.stringify({ translation: 'OK', confidence: 1 }),
        });
        onChunk(makeDoneChunk(req.id, { translation: 'OK', confidence: 1 }));
      },
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T00:00:00Z'));
    try {
      const router = createRouter(
        baseDeps({
          backends: [b],
          getSettings: async () =>
            mkSettings({
              cacheEnabled: false,
              anthropicApiKey: 'k',
              advanced: { ...DEFAULT_SETTINGS.advanced, backendProbeTtlMs: 5_000 },
            }),
        }),
      );
      await router.handleTranslate({ ...baseReq, id: 'probe-1' }, () => {});
      // Past the user's 5s TTL but well below the legacy 30s default.
      vi.advanceTimersByTime(6_000);
      await router.handleTranslate({ ...baseReq, id: 'probe-2' }, () => {});
      // Two probes — one per call, because the user TTL expired between.
      expect(probeSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
