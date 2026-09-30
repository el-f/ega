import { describe, it } from 'vitest';
import fc from 'fast-check';
import { computeBackendOrder } from '@/shared/backends/select';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

const bid = (s: string) => asBackendIdUnsafe(s);

const REGISTERED = ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'].map(
  bid,
);

const backendIdArb = fc.constantFrom(...REGISTERED);

const settingsArb = fc
  .record({
    // uniqueArray mirrors what the sanitizer guarantees: no duplicate ids.
    backendOrder: fc.uniqueArray(backendIdArb, { maxLength: 7 }),
    disabledBackends: fc.array(backendIdArb, { maxLength: 6 }),
  })
  .map<Settings>((o) => ({ ...DEFAULT_SETTINGS, ...o }));

describe('computeBackendOrder — properties', () => {
  it('output never contains a disabled id', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const out = computeBackendOrder(s, REGISTERED);
        const disabled = new Set(s.disabledBackends);
        return out.every((id) => !disabled.has(id));
      }),
      { numRuns: 500 },
    );
  });

  it('output ⊆ backendOrder (no extra ids injected)', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const out = computeBackendOrder(s, REGISTERED);
        const legal = new Set(s.backendOrder);
        return out.every((id) => legal.has(id));
      }),
      { numRuns: 500 },
    );
  });

  it('output ⊆ registeredIds when registeredIds supplied', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const out = computeBackendOrder(s, REGISTERED);
        const reg = new Set(REGISTERED);
        return out.every((id) => reg.has(id));
      }),
      { numRuns: 500 },
    );
  });

  it('is deterministic — same input, same output', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const a = computeBackendOrder(s, REGISTERED);
        const b = computeBackendOrder(s, REGISTERED);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      { numRuns: 200 },
    );
  });

  it('output order matches backendOrder (relative order preserved)', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const out = computeBackendOrder(s, REGISTERED);
        const indices = out.map((id) => s.backendOrder.indexOf(id));
        for (let i = 1; i < indices.length; i++) {
          if ((indices[i] as number) <= (indices[i - 1] as number)) return false;
        }
        return true;
      }),
      { numRuns: 500 },
    );
  });
});
