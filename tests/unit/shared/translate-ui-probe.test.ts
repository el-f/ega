import { describe, it, expect, vi, beforeEach } from 'vitest';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { BackendId, Settings } from '@/shared/types';

const getSettings = vi.fn();
const probeAll = vi.fn();
const instantiateAll = vi.fn();

vi.mock('@/shared/storage', () => ({ getSettings: () => getSettings() }));
vi.mock('@/shared/backends/probe-all', () => ({
  probeAll: (...a: unknown[]) => probeAll(...a),
}));
vi.mock('@/shared/backends/registry', () => ({ instantiateAll: () => instantiateAll() }));
vi.mock('@/shared/backends/build-config', () => ({ buildBackendConfig: () => ({}) }));

const { defaultProbe } = await import('@/shared/translate-ui');

const ids = (...list: string[]): BackendId[] => list.map(asBackendIdUnsafe);
const backends = (...list: string[]): Array<{ id: BackendId }> =>
  ids(...list).map((id) => ({ id }));

/** Only the fields defaultProbe reads; the chain rules themselves are the real resolveChainForTask. */
function settings(over: {
  order?: string[];
  disabled?: string[];
  pin?: string;
  chain?: string[];
}): Settings {
  return {
    backendOrder: ids(...(over.order ?? ['anthropic', 'openai', 'ollama'])),
    disabledBackends: ids(...(over.disabled ?? [])),
    taskBackends: over.pin ? { translate: asBackendIdUnsafe(over.pin) } : {},
    advanced: { taskBackendChains: over.chain ? { translate: ids(...over.chain) } : {} },
  } as unknown as Settings;
}

beforeEach(() => {
  instantiateAll.mockReturnValue(backends('anthropic', 'openai', 'ollama'));
});

// The chip names what this picks, so it must follow the chain the router walks for translate.
describe('defaultProbe picks the backend the router would pick', () => {
  it('takes the first reachable id in the configured order, not the first that probed true', async () => {
    getSettings.mockResolvedValue(settings({ order: ['ollama', 'anthropic'] }));
    probeAll.mockResolvedValue({ anthropic: true, openai: true, ollama: true });

    const out = await defaultProbe();

    expect(out.active).toBe('ollama');
    expect(out.available).toEqual({ anthropic: true, openai: true, ollama: true });
  });

  it('skips an unreachable backend that sits earlier in the order', async () => {
    getSettings.mockResolvedValue(settings({ order: ['ollama', 'anthropic'] }));
    probeAll.mockResolvedValue({ anthropic: true, openai: false, ollama: false });

    expect((await defaultProbe()).active).toBe('anthropic');
  });

  it('names the pinned translate backend first', async () => {
    getSettings.mockResolvedValue(settings({ order: ['anthropic', 'ollama'], pin: 'ollama' }));
    probeAll.mockResolvedValue({ anthropic: true, openai: false, ollama: true });

    expect((await defaultProbe()).active).toBe('ollama');
  });

  it('follows the translate task chain over backendOrder', async () => {
    getSettings.mockResolvedValue(settings({ order: ['anthropic', 'openai'], chain: ['openai'] }));
    probeAll.mockResolvedValue({ anthropic: true, openai: true, ollama: false });

    expect((await defaultProbe()).active).toBe('openai');
  });

  it('never names a disabled backend, even when it is the only one that answered', async () => {
    getSettings.mockResolvedValue(
      settings({ order: ['anthropic', 'ollama'], disabled: ['ollama'] }),
    );
    probeAll.mockResolvedValue({ anthropic: false, openai: false, ollama: true });

    expect((await defaultProbe()).active).toBeNull();
  });

  it('reports no active backend when nothing answered', async () => {
    getSettings.mockResolvedValue(settings({ order: ['anthropic'] }));
    probeAll.mockResolvedValue({ anthropic: false, openai: false, ollama: false });

    const out = await defaultProbe();
    expect(out.active).toBeNull();
    expect(out.available).toEqual({ anthropic: false, openai: false, ollama: false });
  });

  it('probes every instantiated backend and skips an ordered id that is not registered', async () => {
    getSettings.mockResolvedValue(settings({ order: ['ghost', 'anthropic'] }));
    probeAll.mockResolvedValue({ ghost: true, anthropic: true });

    const out = await defaultProbe();

    expect(probeAll).toHaveBeenCalledTimes(1);
    const probed = (probeAll.mock.calls[0]?.[0] ?? []) as Array<{ id: string }>;
    expect(probed.map((b) => b.id)).toEqual(['anthropic', 'openai', 'ollama']);
    expect(out.active).toBe('anthropic');
  });
});
