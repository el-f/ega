import { describe, it, expect } from 'vitest';
import { glossaryDigest } from '@/shared/glossary-digest';
import type { GlossaryEntry } from '@/shared/glossary';
import { asLangIdUnsafe } from '@/shared/brands';

function entry(
  term: string,
  translation: string,
  opts: Partial<GlossaryEntry> = {},
): GlossaryEntry {
  return { term, translation, caseSensitive: false, ...opts };
}

describe('glossaryDigest', () => {
  it('returns empty string for empty input (back-compat)', async () => {
    expect(await glossaryDigest([])).toBe('');
  });

  it('is stable: same entries same order → same digest', async () => {
    const entries = [entry('hello', 'hola'), entry('world', 'mundo')];
    expect(await glossaryDigest(entries)).toBe(await glossaryDigest(entries));
  });

  it('is order-independent: same entries different order → same digest', async () => {
    const a = [entry('hello', 'hola'), entry('world', 'mundo')];
    const b = [entry('world', 'mundo'), entry('hello', 'hola')];
    expect(await glossaryDigest(a)).toBe(await glossaryDigest(b));
  });

  it('different entry sets → different digest', async () => {
    const a = [entry('hello', 'hola')];
    const b = [entry('hello', 'bonjour')];
    expect(await glossaryDigest(a)).not.toBe(await glossaryDigest(b));
  });

  it('caseSensitive flag is part of the key', async () => {
    const sensitive = [entry('Hello', 'Hola', { caseSensitive: true })];
    const insensitive = [entry('Hello', 'Hola', { caseSensitive: false })];
    expect(await glossaryDigest(sensitive)).not.toBe(await glossaryDigest(insensitive));
  });

  it('sourceLang scoping is part of the key', async () => {
    const scoped = [entry('cat', 'chat', { sourceLang: asLangIdUnsafe('en') })];
    const unscoped = [entry('cat', 'chat')];
    expect(await glossaryDigest(scoped)).not.toBe(await glossaryDigest(unscoped));
  });

  it('returns a 64-char hex string for non-empty input', async () => {
    const digest = await glossaryDigest([entry('hello', 'hola')]);
    expect(digest).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(digest)).toBe(true);
  });
});
