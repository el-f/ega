import { describe, it, expect } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps as routerDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

// An evicted MV3 worker looks like a backend that stops emitting: no `done`, no `error`, so only the wall-clock timeout ends the request.

function baseDeps(backend: TranslationBackend, translateTimeoutMs: number): RouterDeps {
  return routerDeps({
    backends: [backend],
    getSettings: async () => ({
      ...DEFAULT_SETTINGS,
      backend: bid('anthropic'),
      anthropicApiKey: 'k',
      backendFallbackChain: [],
    }),
    translateTimeoutMs,
  });
}

describe('router MV3 service-worker eviction resilience', () => {
  it('backend stops emitting mid-stream (no done, no error): router emits TIMEOUT', async () => {
    // The stream is cut off before any bytes arrive.
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: ({ cancel }) =>
        new Promise<void>((resolve) => {
          cancel.signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    };
    const router = createRouter(baseDeps(backend, 50));
    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'sw-evict-1',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('TIMEOUT');
    }
    // UIs hide ABORTED as "the user wanted this", so a timeout must not land there.
    expect(chunks.some((c) => c.type === 'error' && c.code === 'ABORTED')).toBe(false);
  });

  it('backend emits one delta, then stream source disappears: router emits TIMEOUT after budget', async () => {
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: ({ req, onChunk, cancel }) => {
        onChunk({ type: 'delta', requestId: req.id, text: 'partial' });
        // Source "disappears" — never resolves until the router aborts.
        return new Promise<void>((resolve) => {
          cancel.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
    };
    const router = createRouter(baseDeps(backend, 50));
    const chunks: TranslationChunk[] = [];
    const started = Date.now();
    await router.handleTranslate(
      {
        id: 'sw-evict-2',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    const elapsed = Date.now() - started;
    const delta = chunks.find((c) => c.type === 'delta');
    expect(delta).toBeDefined();
    if (delta?.type === 'delta') expect(delta.text).toBe('partial');
    // The full budget must be spent — a short-circuit would also emit TIMEOUT.
    expect(elapsed).toBeGreaterThanOrEqual(40);
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('TIMEOUT');
    }
    // A partial stream must not be promoted to a completion.
    expect(chunks.some((c) => c.type === 'done')).toBe(false);
  });

  it('explicit user cancel mid-stream emits ABORTED, not TIMEOUT', async () => {
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: ({ req, onChunk, cancel }) =>
        new Promise<void>((resolve) => {
          onChunk({ type: 'delta', requestId: req.id, text: 'mid' });
          const onAbort = () => {
            // Real backends emit ABORTED on signal abort.
            onChunk({
              type: 'error',
              requestId: req.id,
              code: 'ABORTED',
              message: 'cancelled',
            });
            resolve();
          };
          // cancel() can land before translate() runs, so handle the pre-aborted case too.
          if (cancel.signal.aborted) {
            onAbort();
          } else {
            cancel.signal.addEventListener('abort', onAbort, { once: true });
          }
        }),
    };
    const router = createRouter(baseDeps(backend, 50));
    const chunks: TranslationChunk[] = [];
    const pending = router.handleTranslate(
      {
        id: 'sw-evict-3',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      (c) => chunks.push(c),
    );
    // Cancel on the next microtask: after the abort listener registers, before the 50ms budget.
    await Promise.resolve();
    router.cancel('sw-evict-3');
    await pending;
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('ABORTED');
    }
    expect(chunks.some((c) => c.type === 'error' && c.code === 'TIMEOUT')).toBe(false);
  });
});
