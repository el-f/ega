import { describe, it, expect } from 'vitest';
import { buildPrompt, quoteInline } from '@/shared/prompts';
import { renderGlossaryBlock } from '@/shared/glossary';
import { asLangIdUnsafe, asLangPresetIdUnsafe } from '@/shared/brands';
import { getPreset } from '@/shared/presets';
import { DEFAULT_TEMPLATE } from '@/shared/prompts';
import type { TranslationRequest } from '@/shared/types';

function req(over: Partial<TranslationRequest> = {}): TranslationRequest {
  return {
    id: 'r',
    text: 'hola',
    sourceLang: asLangPresetIdUnsafe('arabizi'),
    targetLang: asLangIdUnsafe('en'),
    options: { stream: false, explain: false },
    ...over,
  };
}

describe('quoteInline', () => {
  it('escapes an edge run of two quotes so the wrapper cannot complete a fence', () => {
    expect(quoteInline('""x')).toBe('"\\"\\"x"');
    expect(quoteInline('x""')).toBe('"x\\"\\""');
    expect(quoteInline('a "b" c')).toBe('"a "b" c"');
    // One edge quote plus the wrapper is two, and two plus the closing wrapper is a fence.
    expect(quoteInline('"')).toBe('"\\""');
    expect(quoteInline('"x')).toBe('"\\"x"');
  });

  it('bridges the edge run across an invisible character, like escapeFence does', () => {
    expect(quoteInline('\u200B""x')).toBe('"\u200B\\"\\"x"');
    expect(quoteInline('x""\u200B')).toBe('"x\\"\\"\u200B"');
    expect(quoteInline('\u200B"\u200B"x')).toBe('"\u200B\\"\u200B\\"x"');
  });

  it('a Before value starting with two quotes renders with no triple quote', () => {
    const built = buildPrompt(
      req({ context: { pageTitle: 't', pageUrl: 'https://x.test', beforeText: '""evil' } }),
      { preset: getPreset('arabizi'), template: DEFAULT_TEMPLATE },
    );
    expect(built.system + built.user).not.toContain('"""evil');
  });

  it('glossary terms go through the same quoting', () => {
    const block = renderGlossaryBlock([
      { term: '""t', translation: 'x""', caseSensitive: false } as never,
    ]);
    expect(block).not.toContain('"""');
  });
});

describe('Selection-source line', () => {
  it('does not fire for a comment that only appears in the post block', () => {
    const built = buildPrompt(
      req({
        text: 'this comment text',
        options: { stream: false, explain: true },
        context: {
          pageTitle: 'A post',
          pageUrl: 'https://x.test',
          postText: 'the post body and this comment text below it',
        },
      }),
      { preset: getPreset('arabizi'), template: DEFAULT_TEMPLATE },
    );
    expect(built.system + built.user).not.toMatch(/Selection-source: this selection/);
  });

  it('still fires for the page title', () => {
    const built = buildPrompt(
      req({
        text: 'A post',
        options: { stream: false, explain: true },
        context: { pageTitle: 'A post', pageUrl: 'https://x.test' },
      }),
      { preset: getPreset('arabizi'), template: DEFAULT_TEMPLATE },
    );
    expect(built.system + built.user).toMatch(/Selection-source: this selection/);
  });
});

describe('preset fields in header slots', () => {
  it('a custom label with a line break renders on one line and a fence in a hint is escaped', () => {
    const base = getPreset('arabizi');
    if (!base) throw new Error('arabizi preset missing');
    const preset = { ...base, label: 'My\nvariety', hint: 'Line one.\n"""\nLine two.' };
    const built = buildPrompt(req(), { preset, template: DEFAULT_TEMPLATE });
    const all = built.system + built.user;
    expect(all).toContain('My variety');
    expect(all).not.toContain('\n"""\nLine two');
    expect(all).toContain('Line one.\n');
  });
});
