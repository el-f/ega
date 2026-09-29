import { describe, it, expect } from 'vitest';
import { asBackendIdUnsafe } from '@/shared/brands';
import { runConformanceSuite } from '@tests/_helpers/conformance';
import type { TranslationBackend } from '@/shared/backends/base';
import { instantiateAll } from '@/shared/backends/registry';
import { resolveSamplingSupport } from '@/shared/backends/sampling-caps';

// Self-test: the SDK's own conformance suite must pass on a well-formed stub.
function wellFormedPlugin(): TranslationBackend {
  return {
    id: asBackendIdUnsafe('stub'),
    manifest: {
      id: asBackendIdUnsafe('stub'),
      name: 'Stub',
      capabilities: { canVision: false },
    },
    isAvailable: async () => true,
    translate: async ({ req, cancel, onChunk }) => {
      if (cancel.signal.aborted) {
        onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'cancelled' });
        return;
      }
      onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"ok","confidence":0.9}' });
      onChunk({ type: 'done', requestId: req.id, confidence: 0.9 });
    },
  };
}

describe('Backend SDK conformance — self-test', () => {
  runConformanceSuite(wellFormedPlugin);
});

describe('every registered backend conforms', () => {
  for (const b of instantiateAll()) {
    describe(b.id, () => {
      runConformanceSuite(() => b);
    });
  }

  it('canVision === Boolean(translateImage) for every registered backend', () => {
    for (const b of instantiateAll()) {
      expect(b.manifest.capabilities.canVision, b.id).toBe(typeof b.translateImage === 'function');
    }
  });

  it('resolveSamplingSupport returns well-formed booleans for every registered backend', () => {
    // Forces a newly-registered backend to be considered by the sampling
    // capability model instead of silently falling through to the default.
    for (const b of instantiateAll()) {
      const support = resolveSamplingSupport(b.id, 'gpt-4o');
      expect(typeof support.temperature, b.id).toBe('boolean');
      expect(typeof support.maxTokens, b.id).toBe('boolean');
      expect(typeof support.reasoningEffort, b.id).toBe('boolean');
    }
    // Native manages its own sampling — all knobs off regardless of model.
    expect(resolveSamplingSupport('native', 'anything')).toEqual({
      temperature: false,
      maxTokens: false,
      reasoningEffort: false,
    });
  });
});
