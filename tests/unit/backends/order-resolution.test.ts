import { describe, it, expect } from 'vitest';
import { computeBackendOrder } from '@/shared/backends/select';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';

const bid = (s: string) => asBackendIdUnsafe(s);

describe('computeBackendOrder', () => {
  it('walks backendOrder skipping disabled', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      backendOrder: ['ollama', 'openai', 'anthropic'].map(bid),
      disabledBackends: ['openai'].map(bid),
    };
    expect(computeBackendOrder(s)).toEqual(['ollama', 'anthropic']);
  });

  it('skips ids not in registered set', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      backendOrder: ['openai', 'anthropic'].map(bid),
      disabledBackends: [],
    };
    expect(computeBackendOrder(s, ['openai'].map(bid))).toEqual(['openai']);
  });

  it('does not promote backend field — order alone determines priority', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      backend: bid('gemini'),
      backendOrder: ['openai', 'gemini'].map(bid),
      disabledBackends: [],
    };
    expect(computeBackendOrder(s)[0]).toBe('openai');
  });
});
