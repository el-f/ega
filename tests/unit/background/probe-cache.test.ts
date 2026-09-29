import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProbeCache } from '@/background/probe-cache';
import type { TranslationBackend, BackendConfig } from '@/shared/backends/base';

/** The probe cache memoizes isAvailable for 30s, so a translate does not probe every backend. */

function makeBackend(id: string, isAvailable: () => Promise<boolean>): TranslationBackend {
  return {
    id,
    isAvailable: vi.fn(isAvailable),
    translate: vi.fn(),
  } as unknown as TranslationBackend;
}

function cfg(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    apiKeys: {},
    model: {
      anthropic: '',
      openai: '',
      gemini: '',
      groq: '',
      deepseek: '',
      together: '',
      mistral: '',
      xai: '',
      fireworks: '',
      openrouter: '',
      ollama: '',
      native: '',
    },
    advanced: {
      promptTemplate: { system: '', user: '' },
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 1024,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-26T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createProbeCache', () => {
  it('first call hits the underlying backend', async () => {
    const cache = createProbeCache();
    const b = makeBackend('openai', async () => true);
    const ok = await cache.probe(b, cfg({ apiKeys: { openai: 'sk-test' } }));
    expect(ok).toBe(true);
    expect(b.isAvailable).toHaveBeenCalledTimes(1);
  });

  it('second call within TTL returns the cached value without re-probing', async () => {
    const cache = createProbeCache();
    const b = makeBackend('openai', async () => true);
    const c = cfg({ apiKeys: { openai: 'sk-test' } });
    await cache.probe(b, c);
    await cache.probe(b, c);
    await cache.probe(b, c);
    expect(b.isAvailable).toHaveBeenCalledTimes(1);
  });

  it('after the 30s TTL elapses the cache re-probes', async () => {
    const cache = createProbeCache();
    const b = makeBackend('openai', async () => true);
    const c = cfg({ apiKeys: { openai: 'sk-test' } });
    await cache.probe(b, c);
    vi.advanceTimersByTime(30_001);
    await cache.probe(b, c);
    expect(b.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('different ollamaUrl values produce independent cache slots', async () => {
    const cache = createProbeCache();
    const b = makeBackend('ollama', async () => true);
    await cache.probe(b, cfg({ ollamaUrl: 'http://localhost:11434' }));
    await cache.probe(b, cfg({ ollamaUrl: 'http://192.168.1.10:11434' }));
    expect(b.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('different nativeCli values produce independent cache slots', async () => {
    const cache = createProbeCache();
    const b = makeBackend('native', async () => true);
    await cache.probe(b, cfg({ nativeCli: 'claude' }));
    await cache.probe(b, cfg({ nativeCli: 'codex' }));
    expect(b.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('keys depend on api-key LENGTH only (length sentinel, never the secret)', async () => {
    // The slot is `k<length>`, never the key, so a DevTools dump shows no secret.
    const cache = createProbeCache();
    const b = makeBackend('openai', async () => true);
    await cache.probe(b, cfg({ apiKeys: { openai: 'aaaaaa' } }));
    await cache.probe(b, cfg({ apiKeys: { openai: 'bbbbbb' } }));
    expect(b.isAvailable).toHaveBeenCalledTimes(1);
  });

  it('keys are sensitive to api-key presence (set vs unset)', async () => {
    const cache = createProbeCache();
    const b = makeBackend('openai', async () => true);
    await cache.probe(b, cfg({ apiKeys: {} }));
    await cache.probe(b, cfg({ apiKeys: { openai: 'sk-test' } }));
    expect(b.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('a url ending where the next field begins does not share a slot', async () => {
    // Without a separator these two configs join to the same string.
    const cache = createProbeCache();
    const b = makeBackend('ollama', async () => true);
    await cache.probe(b, cfg({ ollamaUrl: 'http://h/a', nativeCli: '' }));
    await cache.probe(b, cfg({ ollamaUrl: 'http://h/', nativeCli: 'a' }));
    expect(b.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('isAvailable throws ⇒ cache stores false (router treats backend as down)', async () => {
    const cache = createProbeCache();
    const b = makeBackend('openai', async () => {
      throw new Error('boom');
    });
    const c = cfg({ apiKeys: { openai: 'sk-test' } });
    expect(await cache.probe(b, c)).toBe(false);
    expect(await cache.probe(b, c)).toBe(false);
    expect(b.isAvailable).toHaveBeenCalledTimes(1);
  });

  it('clear() drops every slot — next probe re-runs the backend', async () => {
    const cache = createProbeCache();
    const b = makeBackend('openai', async () => true);
    const c = cfg({ apiKeys: { openai: 'sk-test' } });
    await cache.probe(b, c);
    cache.clear();
    await cache.probe(b, c);
    expect(b.isAvailable).toHaveBeenCalledTimes(2);
  });
});
