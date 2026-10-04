// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitiseStoredSettings } from '@/shared/storage/sanitise';

afterEach(() => {
  vi.restoreAllMocks();
});

const OLD_ROW = {
  theme: 'dark',
  taskBackends: { summarize: 'ollama', explain: 'auto' },
  taskTemperatures: { summarize: 0.9 },
  taskMaxTokens: { grammar: 512 },
  advanced: {
    taskBackendChains: { translate: ['ollama', 'anthropic'] },
    taskTones: { reword: 'formal' },
    temperature: 0.4,
  },
};

describe('a stored row from before the per-task knobs were removed', () => {
  it('reads with every per-task backend, chain, temperature, max tokens and tone gone', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const s = sanitiseStoredSettings(OLD_ROW, []) as unknown as Record<string, unknown>;
    for (const k of ['taskBackends', 'taskTemperatures', 'taskMaxTokens'])
      expect(s).not.toHaveProperty(k);
    const adv = s['advanced'] as Record<string, unknown>;
    expect(adv).not.toHaveProperty('taskBackendChains');
    expect(adv).not.toHaveProperty('taskTones');
    // The rest of the row survives.
    expect(s['theme']).toBe('dark');
    expect(adv['temperature']).toBe(0.4);
  });

  it('a second read of the saved row changes nothing', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const once = sanitiseStoredSettings(OLD_ROW, []);
    const twice = sanitiseStoredSettings(JSON.parse(JSON.stringify(once)), []);
    expect(twice).toEqual(once);
  });
});
