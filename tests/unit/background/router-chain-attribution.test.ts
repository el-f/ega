import { describe, it, expect } from 'vitest';
import { createRouter } from '@/background/router';
import { makeDoneChunk } from '@/shared/backends/base';
import { httpErrorMessage } from '@/shared/backends/transportError';
import { optionsTabForMessage } from '@/shared/error-policy';
import type { TranslationBackend } from '@/shared/backends/base';
import type { ErrCode, Settings, TranslationChunk, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function mkSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    cacheEnabled: false,
    disabledBackends: [],
    ...overrides,
    advanced: {
      ...DEFAULT_SETTINGS.advanced,
      retryCount: 2,
      ...overrides.advanced,
    },
  };
}

function makeTransientBackend(id: string, code: 'RATE_LIMIT' | 'NETWORK'): TranslationBackend {
  return {
    id: asBackendIdUnsafe(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      onChunk({ type: 'error', requestId: req.id, code, message: `${id}: ${code}` });
    },
  };
}

function makeOkBackend(id: string): TranslationBackend {
  return {
    id: asBackendIdUnsafe(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    translate: async ({ req, onChunk }) => {
      onChunk({
        type: 'delta',
        requestId: req.id,
        text: JSON.stringify({ translation: 'ok', confidence: 0.9 }),
      });
      onChunk(makeDoneChunk(req.id, { translation: 'ok', confidence: 0.9 }));
    },
  };
}

function mkReq(): TranslationRequest {
  return {
    id: 'req-attr-1',
    text: 'hello',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    options: { stream: false, explain: false },
  };
}

describe('router — chain exhaustion attribution', () => {
  it('final error message includes first-backend attribution when all three backends fail transiently', async () => {
    const a = makeTransientBackend('anthropic', 'RATE_LIMIT');
    const b = makeTransientBackend('openai', 'NETWORK');
    const c = makeTransientBackend('ollama', 'NETWORK');
    const router = createRouter({
      backends: [a, b, c],
      getSettings: async () =>
        mkSettings({ backendOrder: ['anthropic', 'openai', 'ollama'] as Settings['backendOrder'] }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: noopLogger,
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(mkReq(), (chunk) => chunks.push(chunk));

    const errChunk = chunks.find((c) => c.type === 'error') as
      Extract<TranslationChunk, { type: 'error' }> | undefined;
    expect(errChunk).toBeDefined();
    if (!errChunk) return;

    // Line 2 names where the chain started failing, in words rather than raw codes.
    expect(errChunk.message.split('\n')[1]).toBe(
      'anthropic: Rate limit reached · openai: Network issue · ollama: Network issue',
    );
  });

  it('single-backend chain still emits a normal error (no spurious attribution)', async () => {
    const a = makeTransientBackend('anthropic', 'RATE_LIMIT');
    const router = createRouter({
      backends: [a],
      getSettings: async () =>
        mkSettings({ backendOrder: ['anthropic'] as Settings['backendOrder'] }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: noopLogger,
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(mkReq(), (chunk) => chunks.push(chunk));

    const errChunk = chunks.find((c) => c.type === 'error') as
      Extract<TranslationChunk, { type: 'error' }> | undefined;
    expect(errChunk).toBeDefined();
    expect(errChunk?.message).toBe('anthropic: RATE_LIMIT');
    expect(errChunk?.code).toBe('RATE_LIMIT');
  });

  it('ok chain with fallback backend: success is not affected', async () => {
    const failing = makeTransientBackend('anthropic', 'RATE_LIMIT');
    const ok = makeOkBackend('openai');
    const router = createRouter({
      backends: [failing, ok],
      getSettings: async () =>
        mkSettings({
          backendOrder: ['anthropic', 'openai'] as Settings['backendOrder'],
          advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 1 },
        }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: noopLogger,
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate({ ...mkReq(), id: 'req-ok' }, (chunk) => chunks.push(chunk));

    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeUndefined();
  });

  it('all-disabled task chain falls back to backendOrder (router mirrors select.ts fix)', async () => {
    // gemini is the task chain for 'translate' but is disabled — router must
    // fall back to anthropic from backendOrder rather than dead-ending with [].
    const anthropic = makeOkBackend('anthropic');
    const gemini = makeOkBackend('gemini');
    const router = createRouter({
      backends: [anthropic, gemini],
      getSettings: async () =>
        mkSettings({
          backendOrder: ['anthropic'] as Settings['backendOrder'],
          disabledBackends: ['gemini'] as Settings['disabledBackends'],
          advanced: {
            ...DEFAULT_SETTINGS.advanced,
            retryCount: 0,
            taskBackendChains: { translate: ['gemini'] as Settings['backendOrder'] },
          },
        }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: noopLogger,
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(mkReq(), (chunk) => chunks.push(chunk));

    const done = chunks.find((c) => c.type === 'done');
    expect(done, 'router must succeed via backendOrder fallback, not dead-end').toBeDefined();
    const err = chunks.find((c) => c.type === 'error');
    expect(err, 'no error chunk expected when fallback backend is available').toBeUndefined();
  });

  it('three-backend exhaustion: last backend is the one emitted (confirms scenario setup)', async () => {
    // Verify the three-backend scenario actually goes through all 3 backends
    const a = makeTransientBackend('anthropic', 'RATE_LIMIT');
    const b = makeTransientBackend('openai', 'NETWORK');
    const c = makeTransientBackend('ollama', 'NETWORK');
    const router = createRouter({
      backends: [a, b, c],
      getSettings: async () =>
        mkSettings({ backendOrder: ['anthropic', 'openai', 'ollama'] as Settings['backendOrder'] }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: noopLogger,
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(mkReq(), (chunk) => chunks.push(chunk));

    const errChunk = chunks.find((c) => c.type === 'error') as
      Extract<TranslationChunk, { type: 'error' }> | undefined;
    expect(errChunk).toBeDefined();
    if (!errChunk) return;

    // Nothing fixable in Settings, so the lead is the last backend's own sentence.
    expect(errChunk.code).toBe('NETWORK');
    expect(errChunk.message).toBe(
      'ollama: NETWORK\nanthropic: Rate limit reached · openai: Network issue · ollama: Network issue',
    );
  });
});

describe('router — exhausted chain message', () => {
  function failing(
    id: string,
    chunk: { code: ErrCode; message: string; retryAfterMs?: number },
  ): TranslationBackend {
    return {
      id: asBackendIdUnsafe(id),
      manifest: testManifest(id),
      isAvailable: async () => true,
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'error', requestId: req.id, ...chunk });
      },
    };
  }

  async function exhaust(
    backends: TranslationBackend[],
  ): Promise<Extract<TranslationChunk, { type: 'error' }>> {
    const router = createRouter({
      backends,
      getSettings: async () =>
        mkSettings({ backendOrder: backends.map((b) => b.id) as Settings['backendOrder'] }),
      cache: { get: async () => undefined, set: async () => undefined },
      logger: noopLogger,
    });
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(mkReq(), (chunk) => chunks.push(chunk));
    const errs = chunks.filter((c) => c.type === 'error');
    expect(errs).toHaveLength(1);
    return errs[0] as Extract<TranslationChunk, { type: 'error' }>;
  }

  const badKey = (): string => httpErrorMessage('Anthropic', new Response('', { status: 401 }));

  it('leads with the failure a setting can fix, under its own label, and keeps the last code', async () => {
    const err = await exhaust([
      failing('anthropic', { code: 'AUTH', message: badKey() }),
      failing('gemini', { code: 'RATE_LIMIT', message: 'Slow down.', retryAfterMs: 5000 }),
    ]);

    expect(err.code).toBe('RATE_LIMIT');
    expect(err.retryAfterMs).toBe(5000);
    expect(optionsTabForMessage(err.message, err.code)).toBe('backends');
    const [lead, list] = err.message.split('\n');
    expect(lead).not.toMatch(/\b(AUTH|RATE_LIMIT)\b/);
    expect(lead).toBe(
      'Authentication failed (anthropic). The backend rejected the API key. Check it in Settings → Backends.',
    );
    expect(list).toBe('anthropic: Authentication failed · gemini: Rate limit reached');
  });

  it('takes the lead from the last attempt as-is when that is the fixable one', async () => {
    const err = await exhaust([
      failing('gemini', { code: 'NETWORK', message: 'Could not reach the backend.' }),
      failing('anthropic', { code: 'AUTH', message: badKey() }),
    ]);

    expect(err.message).toBe(
      'The backend rejected the API key. Check it in Settings → Backends.\ngemini: Network issue · anthropic: Authentication failed',
    );
  });

  it('adds no second label when the fixable attempt has the same code as the last', async () => {
    const err = await exhaust([
      failing('anthropic', { code: 'AUTH', message: badKey() }),
      failing('gemini', { code: 'AUTH', message: 'No Gemini API key' }),
    ]);

    expect(err.message.split('\n')[0]).toBe(
      'The backend rejected the API key. Check it in Settings → Backends.',
    );
  });
});
