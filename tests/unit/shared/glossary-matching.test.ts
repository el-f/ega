import { describe, it, expect } from 'vitest';
import { filterGlossaryForRequest, type GlossaryEntry } from '@/shared/glossary';

function entry(over: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    term: 'AI',
    translation: 'artificial intelligence',
    sourceLang: undefined,
    targetLang: undefined,
    caseSensitive: false,
    ...over,
  } as GlossaryEntry;
}

const ctx = (text: string) => ({ text, sourceLang: 'auto', targetLang: 'en' });

describe('short Latin terms need whole-word edges', () => {
  it('does not fire on "AI" inside "said"', () => {
    expect(filterGlossaryForRequest([entry()], ctx('she said nothing'))).toHaveLength(0);
  });

  it('still fires on "AI" as its own word', () => {
    expect(filterGlossaryForRequest([entry()], ctx('the AI answered'))).toHaveLength(1);
  });

  it('fires next to punctuation, which is not a word character', () => {
    expect(filterGlossaryForRequest([entry()], ctx('what about (AI)?'))).toHaveLength(1);
  });

  it('keeps substring matching for longer terms so "wallet" fires on "wallets"', () => {
    expect(filterGlossaryForRequest([entry({ term: 'wallet' })], ctx('two wallets'))).toHaveLength(
      1,
    );
  });

  it('honors caseSensitive on the word-edge path', () => {
    const e = entry({ caseSensitive: true });
    expect(filterGlossaryForRequest([e], ctx('the ai answered'))).toHaveLength(0);
    expect(filterGlossaryForRequest([e], ctx('the AI answered'))).toHaveLength(1);
  });

  it('leaves a short CJK term on substring matching — it has no word edges', () => {
    expect(filterGlossaryForRequest([entry({ term: '日本' })], ctx('日本語です'))).toHaveLength(1);
  });
});

describe('Latin, Cyrillic and Greek terms must start a word', () => {
  it.each([
    ['Rust', 'I trust you'],
    ['Mail', 'Open Gmail'],
    ['ИИ', 'Мы купили две линии'],
    ['λόγος', 'ο διάλόγος'],
  ])('"%s" does not fire inside "%s"', (term, text) => {
    expect(filterGlossaryForRequest([entry({ term })], ctx(text))).toHaveLength(0);
  });

  it.each([
    ['Rust', 'Rust is fast'],
    ['Mail', 'check the mailbox'],
    ['ИИ', 'Новый ИИ вышел'],
    ['C++', 'I write C++ daily'],
    ['Rust', 'trust, then (Rust)'],
  ])('"%s" fires in "%s"', (term, text) => {
    expect(filterGlossaryForRequest([entry({ term })], ctx(text))).toHaveLength(1);
  });

  // CJK and Thai write Latin words with no space; Hebrew joins a prefix letter to them.
  it.each([
    ['iPhone', '我的iPhone坏了'],
    ['Rust', 'このRustのコード'],
    ['Rust', 'ใช้Rustดี'],
    ['Rust', 'בRust'],
  ])('"%s" fires right after a letter of another script in "%s"', (term, text) => {
    expect(filterGlossaryForRequest([entry({ term })], ctx(text))).toHaveLength(1);
  });

  it('keeps substring matching for Hebrew, where prefix letters join the word', () => {
    expect(filterGlossaryForRequest([entry({ term: 'בינה' })], ctx('והבינה עובדת'))).toHaveLength(
      1,
    );
  });
});

describe('both sides are NFC-normalized before matching', () => {
  const composed = 'café';
  const decomposed = 'café';

  it('matches a decomposed term against composed page text', () => {
    expect(decomposed).not.toBe(composed);
    const result = filterGlossaryForRequest(
      [entry({ term: decomposed })],
      ctx(`un ${composed} noir`),
    );
    expect(result).toHaveLength(1);
  });

  it('matches a composed term against decomposed page text', () => {
    const result = filterGlossaryForRequest(
      [entry({ term: composed })],
      ctx(`un ${decomposed} noir`),
    );
    expect(result).toHaveLength(1);
  });
});
