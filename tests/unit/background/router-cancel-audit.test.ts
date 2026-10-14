import { describe, it, expect, vi } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import { TranslationCache } from '@/background/cache';
import type { TranslationBackend } from '@/shared/backends/base';
import type { TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const { pushAuditEntry } = vi.hoisted(() => ({
  pushAuditEntry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/shared/audit-log', () => ({ pushAuditEntry }));

const mkReq = (id: string): TranslationRequest => ({
  id,
  text: 'marhaba',
  sourceLang: 'auto',
  targetLang: asLangIdUnsafe('en'),
  options: { stream: false, explain: false },
});

describe('a user cancel is recorded in the audit row', () => {
  it('writes an ABORTED error when the backend answers the abort one macrotask late', async () => {
    let backendStarted!: () => void;
    const started = new Promise<void>((r) => (backendStarted = r));
    // Cloud backends reject through fetch, so their ABORTED chunk trails the abort event.
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async ({ req, cancel, onChunk }) => {
        backendStarted();
        await new Promise<void>((resolve) => {
          cancel.signal.addEventListener('abort', () => setTimeout(resolve, 0), { once: true });
        });
        onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'cancelled' });
      },
    };
    const deps: RouterDeps = {
      backends: [backend],
      getSettings: async () => ({ ...DEFAULT_SETTINGS, anthropicApiKey: 'k' }),
      cache: new TranslationCache(),
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const router = createRouter(deps);

    const run = router.handleTranslate(mkReq('r1'), () => {});
    await started;
    router.cancel('r1');
    await run;

    expect(pushAuditEntry).toHaveBeenCalledTimes(1);
    expect(pushAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'r1',
        backend: 'anthropic',
        error: expect.objectContaining({ code: 'ABORTED' }),
      }),
    );
  });
});
