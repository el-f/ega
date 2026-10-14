import { describe, it, expect } from 'vitest';
import { computeBackendOrder } from '@/shared/backends/select';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkSettings(overrides: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('computeBackendOrder', () => {
  it('returns backendOrder entries in order, all enabled', () => {
    const order = computeBackendOrder(
      mkSettings({
        backendOrder: ['gemini', 'native', 'anthropic'].map(bid),
        disabledBackends: [],
      }),
    );
    expect(order).toEqual(['gemini', 'native', 'anthropic']);
  });

  it('skips disabled entries', () => {
    const order = computeBackendOrder(
      mkSettings({
        backendOrder: ['gemini', 'native', 'anthropic'].map(bid),
        disabledBackends: ['native'].map(bid),
      }),
    );
    expect(order).toEqual(['gemini', 'anthropic']);
  });

  it('skips all when all disabled', () => {
    const order = computeBackendOrder(
      mkSettings({
        backendOrder: ['gemini', 'native'].map(bid),
        disabledBackends: ['gemini', 'native'].map(bid),
      }),
    );
    expect(order).toEqual([]);
  });

  it('empty backendOrder → empty result', () => {
    const order = computeBackendOrder(
      mkSettings({
        backendOrder: [],
        disabledBackends: [],
      }),
    );
    expect(order).toEqual([]);
  });

  it('backend field does not affect priority — backendOrder determines it', () => {
    const order = computeBackendOrder(
      mkSettings({
        backendOrder: ['anthropic', 'native', 'gemini'].map(bid),
        disabledBackends: [],
      }),
    );
    expect(order[0]).toBe('anthropic');
  });

  it('filters unregistered ids when registeredIds supplied', () => {
    const order = computeBackendOrder(
      mkSettings({
        backendOrder: ['anthropic', 'openai', 'native'].map(bid),
        disabledBackends: [],
      }),
      ['anthropic', 'native'].map(bid),
    );
    expect(order).toEqual(['anthropic', 'native']);
  });

  it('disabled + unregistered both excluded', () => {
    const order = computeBackendOrder(
      mkSettings({
        backendOrder: ['anthropic', 'openai', 'native', 'gemini'].map(bid),
        disabledBackends: ['anthropic'].map(bid),
      }),
      ['anthropic', 'openai', 'native'].map(bid),
    );
    // anthropic: disabled; gemini: not registered
    expect(order).toEqual(['openai', 'native']);
  });

  it('omitting registeredIds includes all enabled entries regardless of registry', () => {
    const order = computeBackendOrder(
      mkSettings({
        backendOrder: ['anthropic', 'openai'].map(bid),
        disabledBackends: [],
      }),
    );
    expect(order).toEqual(['anthropic', 'openai']);
  });
});
