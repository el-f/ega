import { describe, it, expect } from 'vitest';
import { shouldShowBubbleWithReason } from '@/content/should-show-bubble';
import type { CustomLanguage, Settings } from '@/shared/types';
import { preset } from '@tests/_helpers/lang';

const NO_CUSTOMS: CustomLanguage[] = [];

const shouldShowBubble = (...a: Parameters<typeof shouldShowBubbleWithReason>): boolean =>
  shouldShowBubbleWithReason(...a).show;

function m(mode: Settings['bubbleMode']): Pick<Settings, 'bubbleMode'> {
  return { bubbleMode: mode };
}

describe('shouldShowBubble — never mode', () => {
  it('returns false for any non-empty text', () => {
    expect(shouldShowBubble({ text: 'Hello world' }, m('never'), NO_CUSTOMS)).toBe(false);
    expect(
      shouldShowBubble({ text: 'mar7aba, kifak? shu 3am ta3mel?' }, m('never'), NO_CUSTOMS),
    ).toBe(false);
    expect(shouldShowBubble({ text: 'مرحبا كيف حالك' }, m('never'), NO_CUSTOMS)).toBe(false);
  });
  it('returns false for empty text', () => {
    expect(shouldShowBubble({ text: '' }, m('never'), NO_CUSTOMS)).toBe(false);
    expect(shouldShowBubble({ text: '   ' }, m('never'), NO_CUSTOMS)).toBe(false);
  });
});

describe('shouldShowBubble — always mode', () => {
  it('returns true for any non-whitespace text', () => {
    expect(shouldShowBubble({ text: 'Hello world' }, m('always'), NO_CUSTOMS)).toBe(true);
    expect(shouldShowBubble({ text: 'hi' }, m('always'), NO_CUSTOMS)).toBe(true);
    expect(shouldShowBubble({ text: '1' }, m('always'), NO_CUSTOMS)).toBe(true);
  });
  it('returns false for empty / whitespace-only text', () => {
    expect(shouldShowBubble({ text: '' }, m('always'), NO_CUSTOMS)).toBe(false);
    expect(shouldShowBubble({ text: '   \n\t ' }, m('always'), NO_CUSTOMS)).toBe(false);
  });
});

describe('shouldShowBubble — smart mode', () => {
  it('hides plain English paragraphs', () => {
    expect(
      shouldShowBubble(
        { text: 'Hello, how are you today? I hope you are doing well.' },
        m('smart'),
        NO_CUSTOMS,
      ),
    ).toBe(false);
    expect(shouldShowBubble({ text: 'Just a normal sentence.' }, m('smart'), NO_CUSTOMS)).toBe(
      false,
    );
  });

  it('shows Arabic script via non-ASCII branch', () => {
    expect(shouldShowBubble({ text: 'مرحبا كيف حالك' }, m('smart'), NO_CUSTOMS)).toBe(true);
  });

  it('hides English carrying only non-ASCII punctuation or emoji', () => {
    // Curly quotes, an em-dash and emoji are not a foreign script.
    expect(
      shouldShowBubble({ text: 'Hello — how are you today? 😀' }, m('smart'), NO_CUSTOMS),
    ).toBe(false);
    expect(
      shouldShowBubble({ text: '“What are you doing today?” he said.' }, m('smart'), NO_CUSTOMS),
    ).toBe(false);
  });

  it('shows Arabizi via the built-in detector', () => {
    // Arabizi is ASCII-only but the detector catches the 2/3/5/7/8 + letters pattern.
    expect(
      shouldShowBubble({ text: 'mar7aba, kifak? shu 3am ta3mel?' }, m('smart'), NO_CUSTOMS),
    ).toBe(true);
  });

  it('shows on an Arabizi selection with or without a trailing emoji', () => {
    const withEmoji = 'el 2a3de kanet 7elwe bas el jaw 7ar ktir 😭';
    expect(shouldShowBubble({ text: withEmoji }, m('smart'), NO_CUSTOMS)).toBe(true);
    const stripped = 'el 2a3de kanet 7elwe bas el jaw 7ar ktir';
    expect(shouldShowBubble({ text: stripped }, m('smart'), NO_CUSTOMS)).toBe(true);
  });

  it('shows mixed Arabizi+Latin with a SINGLE Arabizi word', () => {
    // detectLang needs 2 Arabizi words; `e5wet` alone passes only via the digit-in-word rule.
    expect(
      shouldShowBubble(
        { text: 'e5wet l jiran ma byeltezmo b aya deal breaching agreements left and right' },
        m('smart'),
        NO_CUSTOMS,
      ),
    ).toBe(true);
  });

  it('does not false-positive on a lone 3-char abbreviation (e2e)', () => {
    // The digit-in-word rule needs 2 letters after the digit, and `e2e` has one.
    expect(
      shouldShowBubble(
        { text: 'We deliver e2e solutions to enterprises.' },
        m('smart'),
        NO_CUSTOMS,
      ),
    ).toBe(false);
  });

  it('shows leetspeak via the built-in detector', () => {
    expect(shouldShowBubble({ text: 'y0u 4r3 pwn3d n00b' }, m('smart'), NO_CUSTOMS)).toBe(true);
  });

  it('hides short ASCII text ("hi")', () => {
    expect(shouldShowBubble({ text: 'hi' }, m('smart'), NO_CUSTOMS)).toBe(false);
  });

  it('hides texts shorter than 6 chars after trim', () => {
    expect(shouldShowBubble({ text: 'hello' }, m('smart'), NO_CUSTOMS)).toBe(false);
    expect(shouldShowBubble({ text: '   abc  ' }, m('smart'), NO_CUSTOMS)).toBe(false);
  });

  it('hides numbers-only selections', () => {
    expect(shouldShowBubble({ text: '12345' }, m('smart'), NO_CUSTOMS)).toBe(false);
    expect(shouldShowBubble({ text: '1234567890' }, m('smart'), NO_CUSTOMS)).toBe(false);
  });

  it('hides empty / whitespace-only selections', () => {
    expect(shouldShowBubble({ text: '' }, m('smart'), NO_CUSTOMS)).toBe(false);
    expect(shouldShowBubble({ text: '        ' }, m('smart'), NO_CUSTOMS)).toBe(false);
  });

  it('shows text matching a custom language autoDetect regex', () => {
    const customs: CustomLanguage[] = [
      {
        id: preset('zz-jargon'),
        label: 'Zzz jargon',
        hint: 'testing',
        examples: [],
        createdAt: 0,
      } satisfies CustomLanguage,
    ];
    // `autoDetect` is not on the CustomLanguage type, but shouldShowBubble reads it when present.
    (customs[0] as unknown as { autoDetect: { regex: string; flags: string } }).autoDetect = {
      regex: 'zz+',
      flags: 'i',
    };
    expect(shouldShowBubble({ text: 'plain english but zzz here' }, m('smart'), customs)).toBe(
      true,
    );
  });

  it('needs the custom language minScore before it shows', () => {
    const customs: CustomLanguage[] = [
      {
        id: preset('zz-jargon'),
        label: 'Zzz jargon',
        hint: 'testing',
        examples: [],
        autoDetect: { regex: 'zz+', flags: 'ig', minScore: 2 },
        createdAt: 0,
      },
    ];
    expect(shouldShowBubble({ text: 'please find zzz attached' }, m('smart'), customs)).toBe(false);
    expect(shouldShowBubble({ text: 'please find zzz zzap attached' }, m('smart'), customs)).toBe(
      true,
    );
  });

  it('ignores a custom language with a broken regex', () => {
    const customs: CustomLanguage[] = [
      {
        id: preset('bad'),
        label: 'Bad regex',
        hint: '',
        examples: [],
        createdAt: 0,
      } satisfies CustomLanguage,
    ];
    (customs[0] as unknown as { autoDetect: { regex: string; flags: string } }).autoDetect = {
      regex: '[unclosed',
      flags: '',
    };
    expect(shouldShowBubble({ text: 'just a regular sentence here' }, m('smart'), customs)).toBe(
      false,
    );
  });
});
