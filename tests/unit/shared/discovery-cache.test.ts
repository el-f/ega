import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readDiscoveryCache,
  writeDiscoveryCache,
  invalidateDiscoveryCache,
} from '@/shared/discovery-cache';
import type { BackendId } from '@/shared/types';

const BACKEND = 'anthropic' as BackendId;
const API_KEY = 'sk-test-key';
const MODELS = ['claude-3-5-haiku', 'claude-3-7-sonnet'];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('readDiscoveryCache', () => {
  it('returns null when nothing cached', async () => {
    const result = await readDiscoveryCache(BACKEND, API_KEY);
    expect(result).toBeNull();
  });

  it('fresh hit — returns stored model list immediately after write', async () => {
    await writeDiscoveryCache(BACKEND, API_KEY, MODELS);
    const result = await readDiscoveryCache(BACKEND, API_KEY);
    expect(result).toEqual(MODELS);
  });

  it('key-rotation invalidation — different API key returns null', async () => {
    await writeDiscoveryCache(BACKEND, API_KEY, MODELS);
    const result = await readDiscoveryCache(BACKEND, 'sk-other-key');
    expect(result).toBeNull();
  });

  it('TTL expiry — entry past ttlMs returns null', async () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await writeDiscoveryCache(BACKEND, API_KEY, MODELS);

    const ttlMs = 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(now + ttlMs + 1);
    const result = await readDiscoveryCache(BACKEND, API_KEY, ttlMs);
    expect(result).toBeNull();
  });

  it('entry at exactly TTL boundary is still valid', async () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await writeDiscoveryCache(BACKEND, API_KEY, MODELS);

    vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000);
    const result = await readDiscoveryCache(BACKEND, API_KEY);
    expect(result).toEqual(MODELS);
  });

  it('corrupt entry — malformed stored object returns null without throwing', async () => {
    await chrome.storage.session.set({
      'ega:discovery:anthropic': { broken: true, fetchedAt: 'bad' },
    });
    const result = await readDiscoveryCache(BACKEND, API_KEY);
    expect(result).toBeNull();
  });

  it('corrupt entry — models array containing non-strings returns null', async () => {
    await chrome.storage.session.set({
      'ega:discovery:anthropic': { models: [1, 2, 3], fetchedAt: Date.now(), keyHash: 'any' },
    });
    const result = await readDiscoveryCache(BACKEND, API_KEY);
    expect(result).toBeNull();
  });

  it('custom ttlMs — entry expired under shorter TTL but fresh under default', async () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await writeDiscoveryCache(BACKEND, API_KEY, MODELS);

    const shortTtl = 1000;
    vi.spyOn(Date, 'now').mockReturnValue(now + shortTtl + 1);
    const result = await readDiscoveryCache(BACKEND, API_KEY, shortTtl);
    expect(result).toBeNull();
  });

  it('backend-scoped — write to one backend does not pollute another', async () => {
    await writeDiscoveryCache(BACKEND, API_KEY, MODELS);
    const result = await readDiscoveryCache('openai' as BackendId, API_KEY);
    expect(result).toBeNull();
  });
});

describe('invalidateDiscoveryCache', () => {
  it('removes cached entry — subsequent read returns null', async () => {
    await writeDiscoveryCache(BACKEND, API_KEY, MODELS);
    await invalidateDiscoveryCache(BACKEND);
    const result = await readDiscoveryCache(BACKEND, API_KEY);
    expect(result).toBeNull();
  });

  it('no-ops safely when nothing is cached', async () => {
    await expect(invalidateDiscoveryCache(BACKEND)).resolves.toBeUndefined();
  });
});
