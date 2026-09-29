import { describe, it, expect } from 'vitest';
import { detectLang, resolveSourceLang } from '@/content/detect';
import { preset, sel } from '@tests/_helpers/lang';
import type { CustomLanguage } from '@/shared/types';

const KLINGON: CustomLanguage = {
  id: preset('3f7c2e48-b1a1-4b1a-92a4-abcdef012345'),
  label: 'Klingon',
  hint: 'test',
  examples: [],
  autoDetect: { regex: '\\bnuq\\w*\\b', flags: 'i', minScore: 2 },
  createdAt: 0,
};

describe('detectLang', () => {
  it('flags Arabizi', () => {
    expect(detectLang('mar7aba, kifak? shu 3am ta3mel?')?.id).toBe('arabizi');
  });
  it('returns undefined on plain English', () => {
    expect(detectLang('Hello, how are you today?')).toBeUndefined();
  });
  it.each([
    'Meet me at 7pm, room B12, level 3a',
    'Order #A7 shipped, ETA 5 days, bay C2',
    'Build v2 passed on node 20, see PR 385',
  ])('does not flag English with room/version/bay codes as Arabizi: %s', (text) => {
    expect(detectLang(text)).toBeUndefined();
  });
  it.each([
    'el 2a3de li la3anet 2em',
    'keef 7alak ya 7abibi',
    '3eyzina w 3adi ya habibi',
    'yalla ma3ak shi 7elow ktir 3njad',
  ])('still flags real Arabizi: %s', (text) => {
    expect(detectLang(text)?.id).toBe('arabizi');
  });
  it('counts a custom regex only over the same capped input safeCount probes', () => {
    const text = `nuq ${'x'.repeat(1100)} nuq nuqneH`;
    expect(detectLang(text, { customs: [KLINGON] })).toBeUndefined();
    expect(detectLang(`nuq nuqneH ${'x'.repeat(1100)}`, { customs: [KLINGON] })?.id).toBe(
      KLINGON.id,
    );
  });
  it('flags leetspeak', () => {
    expect(detectLang('y0u 4r3 pwn3d n00b')?.id).toBe('leetspeak');
  });
});

describe('detectLang — languages', () => {
  it('skips a language the user excluded from auto-detection', () => {
    const settings = { disabledVarieties: ['arabizi'] };
    expect(detectLang('mar7aba, kifak? shu 3am ta3mel?', { settings })).toBeUndefined();
  });

  it('uses the user override of a built-in autoDetect regex', () => {
    const settings = {
      varietyOverrides: {
        arabizi: { autoDetect: { regex: '\\bzz\\w*\\b', flags: 'i', minScore: 2 } },
      },
    };
    // The shipped regex still matches this text; the override does not.
    expect(detectLang('mar7aba, kifak? shu 3am ta3mel?', { settings })).toBeUndefined();
    expect(detectLang('zzap zzop and away', { settings })?.id).toBe('arabizi');
  });

  it('resolves a custom language', () => {
    expect(detectLang('nuqneH nuqDaq please', { customs: [KLINGON] })?.id).toBe(KLINGON.id);
  });

  it('honors a custom language minScore', () => {
    expect(detectLang('nuqneH please', { customs: [KLINGON] })).toBeUndefined();
  });

  it('skips a disabled custom language', () => {
    const settings = { disabledVarieties: [KLINGON.id as string] };
    expect(detectLang('nuqneH nuqDaq please', { customs: [KLINGON], settings })).toBeUndefined();
  });

  it('ignores a custom language with a broken regex', () => {
    const broken: CustomLanguage = {
      ...KLINGON,
      autoDetect: { regex: '[unclosed', flags: '', minScore: 1 },
    };
    expect(detectLang('nuqneH nuqDaq please', { customs: [broken] })).toBeUndefined();
  });
});

describe('resolveSourceLang (default-language select)', () => {
  // "auto" mode: the detector runs and its hit wins; on no hit we fall
  // through to 'auto' so the backend can do its own sniffing.
  it('auto + detectable text → returns the detected language id', () => {
    expect(resolveSourceLang('mar7aba, kifak? shu 3am ta3mel?', 'auto')).toBe('arabizi');
    expect(resolveSourceLang('y0u 4r3 pwn3d n00b', 'auto')).toBe('leetspeak');
  });
  it('auto + undetectable text → returns "auto" (backend does sniffing)', () => {
    expect(resolveSourceLang('Hello, how are you today?', 'auto')).toBe('auto');
  });
  it('specific language id → returns that id verbatim (detector skipped)', () => {
    // User chose Arabizi as default — even on plain English we send
    // "arabizi", not "auto". The detector must NOT second-guess the user.
    expect(resolveSourceLang('Hello, how are you today?', sel('arabizi'))).toBe('arabizi');
  });
  it('specific id is NOT overridden by a conflicting detector hit', () => {
    // User selected elvish-quenya as default. Text looks like arabizi.
    // Still returns elvish-quenya, because the user's explicit choice wins.
    expect(resolveSourceLang('mar7aba, kifak? shu 3am ta3mel?', sel('elvish-quenya'))).toBe(
      'elvish-quenya',
    );
  });
  it('custom language id (uuid-shaped) passes through unchanged', () => {
    const customId = sel('3f7c2e48-b1a1-4b1a-92a4-abcdef012345');
    expect(resolveSourceLang('some text', customId)).toBe(customId);
  });
  it('auto + a custom variety hit → returns the custom id', () => {
    expect(resolveSourceLang('nuqneH nuqDaq please', 'auto', { customs: [KLINGON] })).toBe(
      KLINGON.id,
    );
  });
});
