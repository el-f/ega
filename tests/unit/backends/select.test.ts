import { describe, it, expect } from 'vitest';
import { computeBackendOrder, resolveChainForTask } from '@/shared/backends/select';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { BackendId, Settings } from '@/shared/types';
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

describe('resolveChainForTask', () => {
  it('returns per-task chain when present, filtering disabled', () => {
    const chain = resolveChainForTask(
      {
        backendOrder: ['anthropic', 'openai'].map(bid),
        disabledBackends: [bid('groq')] as readonly BackendId[],
        taskBackendChains: { translate: ['gemini', 'groq', 'native'].map(bid) },
      },
      'translate',
    );
    expect(chain).toEqual(['gemini', 'native']);
  });

  it('falls back to backendOrder when no per-task chain', () => {
    const chain = resolveChainForTask(
      {
        backendOrder: ['anthropic', 'openai', 'gemini'].map(bid),
        disabledBackends: [],
        taskBackendChains: {},
      },
      'translate',
    );
    expect(chain).toEqual(['anthropic', 'openai', 'gemini']);
  });

  it('falls back to backendOrder when chain is empty array', () => {
    const chain = resolveChainForTask(
      {
        backendOrder: ['anthropic'].map(bid),
        disabledBackends: [],
        taskBackendChains: { translate: [] },
      },
      'translate',
    );
    expect(chain).toEqual(['anthropic']);
  });

  it('filters unregistered ids when registeredIds supplied', () => {
    const chain = resolveChainForTask(
      {
        backendOrder: ['anthropic', 'openai'].map(bid),
        disabledBackends: [],
        taskBackendChains: { translate: ['gemini', 'anthropic'].map(bid) },
      },
      'translate',
      ['anthropic', 'openai'].map(bid),
    );
    // gemini not in registered set → filtered
    expect(chain).toEqual(['anthropic']);
  });

  it('different tasks resolve to different chains', () => {
    const input = {
      backendOrder: ['anthropic'].map(bid),
      disabledBackends: [],
      taskBackendChains: {
        translate: ['gemini'].map(bid),
        explain: ['groq', 'openai'].map(bid),
      },
    };
    expect(resolveChainForTask(input, 'translate')).toEqual(['gemini']);
    expect(resolveChainForTask(input, 'explain')).toEqual(['groq', 'openai']);
    expect(resolveChainForTask(input, 'summarize')).toEqual(['anthropic']);
  });

  it('hoists a per-task pin to the head of the chain (mirrors the router)', () => {
    const chain = resolveChainForTask(
      {
        backendOrder: ['anthropic', 'openai', 'gemini'].map(bid),
        disabledBackends: [],
        taskBackendChains: {},
        taskBackends: { translate: bid('openai') },
      },
      'translate',
    );
    expect(chain).toEqual(['openai', 'anthropic', 'gemini']);
  });

  it('pin hoists ahead of a per-task chain it is not part of', () => {
    const chain = resolveChainForTask(
      {
        backendOrder: ['anthropic'].map(bid),
        disabledBackends: [],
        taskBackendChains: { translate: ['gemini', 'groq'].map(bid) },
        taskBackends: { translate: bid('openai') },
      },
      'translate',
    );
    expect(chain).toEqual(['openai', 'gemini', 'groq']);
  });

  it("ignores a pin that is 'auto', disabled, or unregistered", () => {
    const base = {
      backendOrder: ['anthropic', 'openai'].map(bid),
      disabledBackends: ['gemini'].map(bid),
      taskBackendChains: {},
    };
    expect(
      resolveChainForTask({ ...base, taskBackends: { translate: 'auto' } }, 'translate'),
    ).toEqual(['anthropic', 'openai']);
    expect(
      resolveChainForTask({ ...base, taskBackends: { translate: bid('gemini') } }, 'translate'),
    ).toEqual(['anthropic', 'openai']);
    expect(
      resolveChainForTask(
        { ...base, taskBackends: { translate: bid('groq') } },
        'translate',
        ['anthropic', 'openai'].map(bid),
      ),
    ).toEqual(['anthropic', 'openai']);
  });

  it('pin only affects its own task', () => {
    const input = {
      backendOrder: ['anthropic', 'openai'].map(bid),
      disabledBackends: [],
      taskBackendChains: {},
      taskBackends: { translate: bid('openai') },
    };
    expect(resolveChainForTask(input, 'translate')).toEqual(['openai', 'anthropic']);
    expect(resolveChainForTask(input, 'explain')).toEqual(['anthropic', 'openai']);
  });

  it('all-disabled task chain falls back to backendOrder (not empty dead-end)', () => {
    const input = {
      backendOrder: ['anthropic'].map(bid),
      disabledBackends: ['gemini'].map(bid),
      taskBackendChains: { reword: ['gemini'].map(bid) },
    };
    expect(resolveChainForTask(input, 'reword')).toEqual(['anthropic']);
    expect(resolveChainForTask(input, 'translate')).toEqual(['anthropic']);
  });
});
