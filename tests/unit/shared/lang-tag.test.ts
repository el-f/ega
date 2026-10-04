import { describe, it, expect } from 'vitest';
import { langTag, replyLang } from '@/shared/lang-tag';

describe('langTag — a BCP-47 tag for a lang attribute', () => {
  it('passes a language code through', () => {
    expect(langTag('fr')).toBe('fr');
    expect(langTag('zh-TW')).toBe('zh-TW');
  });

  it('tags Arabizi as Arabic written in Latin letters', () => {
    expect(langTag('arabizi')).toBe('ar-Latn');
  });

  it('names no tag for auto, a variety with no script tag, a custom language or nothing', () => {
    expect(langTag('auto')).toBeUndefined();
    expect(langTag('genz-slang')).toBeUndefined();
    expect(langTag('c-3f2a9b')).toBeUndefined();
    expect(langTag('')).toBeUndefined();
    expect(langTag(undefined)).toBeUndefined();
  });

  it('does not pass through a code-shaped string that is not a known language', () => {
    expect(langTag('xx')).toBeUndefined();
  });
});

describe('replyLang — which language the reply is written in', () => {
  it('Reword and Grammar answer in the input language', () => {
    expect(replyLang('reword', 'en', 'es')).toBe('es');
    expect(replyLang('grammar', 'en', 'de')).toBe('de');
  });

  it('every other task answers in the target', () => {
    for (const task of ['translate', 'explain', 'summarize', 'suggest-replies', 'ask', 'c-task']) {
      expect(replyLang(task, 'fr', 'es')).toBe('fr');
    }
  });
});
