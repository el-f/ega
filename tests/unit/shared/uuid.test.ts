import { describe, it, expect, afterEach, vi } from 'vitest';
import { id, uuid } from '@/shared/uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('id (short form)', () => {
  it('returns a string with the given prefix', () => {
    const v = id('ega-input');
    expect(v).toMatch(/^ega-input-[0-9a-f]{8}$/);
  });

  it('returns different ids on repeated calls', () => {
    expect(id('x')).not.toBe(id('x'));
  });

  it('defaults to "id" prefix when no arg given', () => {
    expect(id().startsWith('id-')).toBe(true);
  });
});

describe('uuid', () => {
  it('produces unique 36-char RFC 4122 v4 strings', () => {
    const a = uuid();
    const b = uuid();
    expect(a).not.toBe(b);
    expect(a).toMatch(V4);
  });
});

describe('id — getRandomValues fallback', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');

  function hideRandomUUID(): void {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
    vi.restoreAllMocks();
  });

  it('still returns a v4 UUID when randomUUID is absent', () => {
    hideRandomUUID();
    expect(uuid()).toMatch(V4);
  });

  it('still returns unique prefixed ids when randomUUID is absent', () => {
    hideRandomUUID();
    const a = id('ega-input');
    expect(a).toMatch(/^ega-input-[0-9a-f]{8}$/);
    expect(a).not.toBe(id('ega-input'));
  });

  it('forces the version and variant bits even when every random byte is 0xff', () => {
    hideRandomUUID();
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(
      <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint8Array) array.fill(0xff);
        return array;
      },
    );
    expect(uuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
