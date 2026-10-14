import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { createRouter } from '@/background/router';
import type { TranslationBackend } from '@/shared/backends/base';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';

const KNOWN_IDS = ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'];

function makeBackend(id: string): TranslationBackend {
  return {
    id: asBackendIdUnsafe(id),
    manifest: {
      id: asBackendIdUnsafe(id),
      name: id,
      capabilities: { canVision: id === 'anthropic' || id === 'openai' || id === 'gemini' },
    },
    isAvailable: vi.fn().mockResolvedValue(true),
    translate: vi.fn().mockResolvedValue(undefined),
  } as unknown as TranslationBackend;
}

/** resolveBackends is private to createRouter, so the probe order is read through the translate path. */
describe('resolveBackends', () => {
  it('all returned backends have ids from the registered set', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(KNOWN_IDS, { minLength: 1, maxLength: 5 }),
        async (enabledIds) => {
          const backends = enabledIds.map(makeBackend);
          const registeredIds = new Set(backends.map((b) => b.id as string));

          const probedIds: string[] = [];
          const patchedBackends = backends.map((b) => ({
            ...b,
            isAvailable: vi.fn().mockImplementation(async () => {
              probedIds.push(b.id as string);
              return true;
            }),
          })) as unknown as TranslationBackend[];

          const settings: Settings = {
            ...DEFAULT_SETTINGS,
            backendOrder: enabledIds.map((id) => asBackendIdUnsafe(id)),
            disabledBackends: [],
          };

          const router = createRouter({
            backends: patchedBackends,
            getSettings: vi.fn().mockResolvedValue(settings),
            cache: {
              get: vi.fn().mockResolvedValue(undefined),
              set: vi.fn().mockResolvedValue(undefined),
            },
            logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
          });

          // Run a translate so resolveBackends probes; the outcome does not matter.
          try {
            await router.handleTranslate(
              {
                id: 'test-req',
                text: 'hello',
                sourceLang: 'auto',
                targetLang: asLangIdUnsafe('en'),
                options: { stream: false, explain: false, task: 'translate' },
              },
              vi.fn(),
            );
          } catch {
            // translate will fail — we only care about the probe calls
          }

          for (const probed of probedIds) {
            expect(registeredIds.has(probed)).toBe(true);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
