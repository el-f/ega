import { describe, it, expect } from 'vitest';
import {
  BACKENDS,
  resolveBackend,
  instantiateAll,
  getRegisteredBackendIds,
} from '@/shared/backends/registry';
import { backendNeedsKey } from '@/shared/backends/key-presence';
import { asBackendIdUnsafe } from '@/shared/brands';

describe('backend registry', () => {
  it('contains at least three backends (native, anthropic, openai)', () => {
    expect(BACKENDS.length).toBeGreaterThanOrEqual(3);
    const ids = BACKENDS.map((f) => f().id);
    expect(ids).toContain('native');
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai');
  });

  it('ids are unique', () => {
    const ids = BACKENDS.map((f) => f().id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('resolveBackend finds a backend by id', () => {
    const b = resolveBackend('anthropic');
    expect(b).not.toBeNull();
    if (!b) throw new Error('expected backend');
    expect(b.id).toBe('anthropic');
  });

  it('resolveBackend returns null for unknown id', () => {
    expect(resolveBackend('made-up')).toBeNull();
  });

  it('instantiateAll returns the registry-cached instances (same references across calls)', () => {
    const a = instantiateAll();
    const b = instantiateAll();
    // Arrays are fresh (defensive copy) but instances are reused.
    expect(a).not.toBe(b);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i]);
    }
    expect(a.map((x) => x.id).sort()).toEqual(b.map((x) => x.id).sort());
  });

  it('does not register chrome-ai', () => {
    const ids = BACKENDS.map((f) => f().id);
    expect(ids).not.toContain('chrome-ai');
  });

  it('registers the expected 13 backends', () => {
    expect(BACKENDS.length).toBe(13);
  });

  it.each(['together', 'mistral', 'xai', 'fireworks', 'openrouter'])(
    'registers the %s OpenAI-compat provider and marks it as needing a key',
    (id) => {
      expect(getRegisteredBackendIds()).toContain(id);
      const b = resolveBackend(id);
      expect(b?.id).toBe(id);
      expect(backendNeedsKey(asBackendIdUnsafe(id))).toBe(true);
    },
  );
});
