import { describe, it, expect } from 'vitest';
import { OCR_SYSTEM_PROMPT, OCR_USER_INSTRUCTION, buildOcrPrompt } from '@/shared/ocr-prompt';

describe('OCR prompts', () => {
  it('system prompt requests JSON translation+confidence shape', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/translation/);
    expect(OCR_SYSTEM_PROMPT).toMatch(/confidence/);
    expect(OCR_SYSTEM_PROMPT).toMatch(/JSON/i);
  });
  it('instruction asks for empty translation when image has no text', () => {
    expect(OCR_USER_INSTRUCTION).toMatch(/no text/i);
  });

  it('default system prompt names English as the target language', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/English/);
  });

  it('system prompt anchors the confidence scale with 0..1 anchors', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/0\.\.1/);
    expect(OCR_SYSTEM_PROMPT).toMatch(/unambiguous|dominant reading/i);
  });

  it('system prompt gives reading-order / RTL / column guidance', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/reading order/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/right-to-left|RTL/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/column/i);
  });

  it('system prompt handles already-target-language case (echo passthrough)', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/already in English|echo it back|passthrough/i);
  });

  it('system prompt preserves mentions/hashtags/URLs/emoji verbatim', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/hashtag|handle|URL|emoji/i);
  });

  it('system prompt fences image text as untrusted data, not instructions', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/untrusted/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/never.*instructions|not.*instructions/i);
  });

  it('the untrusted-data line is constant across target languages (cache-safe)', () => {
    const en = buildOcrPrompt('English');
    const fr = buildOcrPrompt('French');
    const line = /[^.]*untrusted[^.]*\./i;
    const enMatch = en.system.match(line)?.[0];
    const frMatch = fr.system.match(line)?.[0];
    expect(enMatch).toBeTruthy();
    expect(enMatch).toBe(frMatch);
  });

  it('system prompt demands one clean translation — no preamble, source echo, or alternatives', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/only the final result|final result/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/preamble/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/alternativ/i);
  });

  it('the output-discipline line is constant across target languages (cache-safe)', () => {
    const en = buildOcrPrompt('English');
    const fr = buildOcrPrompt('French');
    const line = /[^.]*final result[^.]*\./i;
    const enMatch = en.system.match(line)?.[0];
    expect(enMatch).toBeTruthy();
    expect(enMatch).toBe(fr.system.match(line)?.[0]);
  });

  describe('buildOcrPrompt', () => {
    it('threads a custom target language into both system and user strings', () => {
      const tpl = buildOcrPrompt('French');
      expect(tpl.system).toMatch(/translate it to French/);
      expect(tpl.system).toMatch(/already in French/);
      expect(tpl.user).toMatch(/translate it to French/);
    });

    it('default (no arg) matches the back-compat constants', () => {
      const tpl = buildOcrPrompt();
      expect(tpl.system).toBe(OCR_SYSTEM_PROMPT);
      expect(tpl.user).toBe(OCR_USER_INSTRUCTION);
    });
  });
});
