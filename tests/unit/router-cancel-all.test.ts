import { describe, it, expect, beforeEach } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { clearAuditLog } from '@/shared/audit-log';
import type { Settings, TranslationRequest } from '@/shared/types';
import { resetChromeMock } from '../mocks/chrome';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { TranslationBackend } from '@/shared/backends/base';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string) => asBackendIdUnsafe(s);

beforeEach(async () => {
  resetChromeMock();
  await clearAuditLog();
});

function mkSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function logger(): RouterDeps['logger'] {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function noopCache(): RouterDeps['cache'] {
  return { get: async () => undefined, set: async () => undefined };
}

/** Never resolves until cancelAll; entered fires after the router registered the AbortController. */
function pendingBackend(id: string): TranslationBackend & { entered: Promise<void> } {
  let signalEntered = (): void => {};
  const entered = new Promise<void>((r) => {
    signalEntered = r;
  });
  return {
    id: bid(id),
    manifest: testManifest(id),
    isAvailable: async () => true,
    entered,
    translate: async ({ cancel }) => {
      signalEntered();
      await new Promise<void>((_resolve, reject) => {
        cancel.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        // Never resolves of its own accord.
      });
    },
  };
}

const baseReq: TranslationRequest = {
  id: 'req-cancel-all',
  text: 'salam',
  sourceLang: sel('arabizi'),
  targetLang: sel('en'),
  options: { stream: true, explain: false },
};

describe('router.cancelAll', () => {
  it('aborts every in-flight controller and returns the count', async () => {
    const backend = pendingBackend('anthropic');
    const router = createRouter({
      backends: [backend],
      getSettings: async () => mkSettings({ cacheEnabled: false, anthropicApiKey: 'k' }),
      cache: noopCache(),
      logger: logger(),
      translateTimeoutMs: 30_000,
    });
    // Kick two translates without awaiting — they stay in-flight.
    void router.handleTranslate({ ...baseReq, id: 'r1' }, () => {});
    void router.handleTranslate({ ...baseReq, id: 'r2' }, () => {});

    await backend.entered;

    const count = router.cancelAll();
    expect(count).toBeGreaterThanOrEqual(1);
    // Lower bound: only the first translate is guaranteed to have registered.
  });

  it('returns 0 when nothing is in flight', () => {
    const router = createRouter({
      backends: [pendingBackend('anthropic')],
      getSettings: async () => mkSettings({ anthropicApiKey: 'k' }),
      cache: noopCache(),
      logger: logger(),
    });
    expect(router.cancelAll()).toBe(0);
  });
});
