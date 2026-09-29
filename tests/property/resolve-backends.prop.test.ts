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

/** resolveBackendsForTask is private to createRouter, so the probe order is read through the translate path. */
describe('resolveBackendsForTask', () => {
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

          // Trigger a translate so resolveBackendsForTask runs internally
          // We don't care about the outcome — just that no fabricated ids appear
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

  it('pinned backend with taskBackends is probed before the rest', async () => {
    // Pin the second of three available backends; it must be probed first.
    const ids = KNOWN_IDS.slice(0, 3); // ['anthropic', 'openai', 'gemini']
    const pinnedId = ids[1]; // 'openai' — NOT the first in backendOrder
    if (pinnedId === undefined) throw new Error('need at least 3 known backend ids');

    const probeOrder: string[] = [];
    const patchedBackends = ids.map((id) => {
      const b = makeBackend(id);
      return {
        ...b,
        isAvailable: vi.fn().mockImplementation(async () => {
          probeOrder.push(id);
          return true;
        }),
      } as unknown as TranslationBackend;
    });

    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      backendOrder: ids.map((id) => asBackendIdUnsafe(id)),
      disabledBackends: [],
      taskBackends: { translate: asBackendIdUnsafe(pinnedId) },
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

    try {
      await router.handleTranslate(
        {
          id: 'pin-test',
          text: 'world',
          sourceLang: 'auto',
          targetLang: asLangIdUnsafe('en'),
          options: { stream: false, explain: false, task: 'translate' },
        },
        vi.fn(),
      );
    } catch {
      // translate failing is expected — we care only about probe order
    }

    // The pinned backend was available → it MUST have been probed
    expect(probeOrder).toContain(pinnedId);

    // It must appear at index 0 — before every non-pinned backend
    const pinnedIdx = probeOrder.indexOf(pinnedId);
    const nonPinnedIndices = probeOrder
      .map((id, i) => ({ id, i }))
      .filter(({ id }) => id !== pinnedId)
      .map(({ i }) => i);

    // There must be at least one non-pinned probe so the ordering claim is meaningful
    expect(nonPinnedIndices.length).toBeGreaterThan(0);

    for (const nonPinnedIdx of nonPinnedIndices) {
      expect(pinnedIdx).toBeLessThan(nonPinnedIdx);
    }
  });
});
