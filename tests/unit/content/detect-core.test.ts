// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { detectLang } from '@/content/detect';
import { shouldShowBubbleWithReason } from '@/content/should-show-bubble';
import {
  lexiconCacheInternal,
  loadEnglishLexicon,
  looksLikeEnglish,
} from '@/content/looks-like-english';
import { safeCount } from '@/shared/safe-regex';
import { preset } from '@tests/_helpers/lang';
import type { CustomLanguage } from '@/shared/types';

const smart = { bubbleMode: 'smart' as const, smartBubbleMinLength: 6 };
const bubble = (text: string) => shouldShowBubbleWithReason({ text }, smart, []);

describe('the script check runs before the length gate', () => {
  it('shows a two-letter Hebrew word even at a minimum of 6', () => {
    expect(bubble('כן')).toEqual({ show: true, reason: 'non-ascii' });
  });
});

// Ordinals, units, versions, hashes and identifiers carry a digit between letters too.
describe('English with digits is not Arabizi or leetspeak', () => {
  it.each([
    'Our B2B and B2C sales grew in Q3',
    'She came 2nd in the race and 3rd overall',
    'Meet at 10am, then 2pm call, 5pm wrap',
    'Use sha256 not md5 for the hash',
    'The co2 levels and h2o vapour rose',
    'Order 25kg of flour and 3kg of sugar',
    'Grab the usb3 cable and the hdmi2 port',
    'The p2p network and the 2fa code work',
    'Call getUser2 and setValue3 in the code',
    'Open page2 and file2 in the viewer',
    'Take the 7train to 42nd street',
    'We need i18n and l10n support',
    'Upgrade from win10 to win11 today',
    'Use the A380 and the B747 planes',
    'Stream it in 4k or 1080p',
    'I scored 1st place in the 100m race',
    'Only 5mins left, see you 2morrow',
    'Meet at 5ish, bring the mp3s and an iphone6s',
  ])('%s', (text) => {
    expect(detectLang(text)?.id).toBeUndefined();
  });
});

// A tool, product or chemical name has the Arabizi shape; the words around it decide.
const ENGLISH_WITH_A_NAME = [
  'Run md5sum on the file before uploading it.',
  'Acetic acid, CH3COOH, is the main part of vinegar.',
  'Total emissions were 50 tCO2e last year.',
  'I learned HTML on w3schools years ago.',
  'My old mp3player still works fine.',
  'c3po is my favorite droid in the films.',
  'Load html5shiv for old browsers.',
  'Install md5sum and s3cmd, then read the w3schools page.',
  'The release notes explain how the new installer checks every download. Run md5sum on the archive, compare it with the published value, and only then unpack it into the program folder.',
];

describe('English with one Arabizi-shaped name is not Arabizi', () => {
  it.each(ENGLISH_WITH_A_NAME)('before the lexicon loads: %s', (text) => {
    expect(detectLang(text)?.id).toBeUndefined();
  });

  describe('with the lexicon loaded', () => {
    beforeAll(async () => {
      await loadEnglishLexicon();
    });
    afterAll(() => {
      lexiconCacheInternal.mod = null;
      lexiconCacheInternal.promise = null;
    });
    it.each(ENGLISH_WITH_A_NAME)('%s', (text) => {
      expect(detectLang(text)?.id).toBeUndefined();
    });
  });

  // The product call: a mostly English line goes out as auto, and the bubble still shows for its Arabizi word.
  it('reads a mostly English line with one Arabizi word as auto, and still shows the bubble', () => {
    expect(detectLang('I love you 7abibi')?.id).toBeUndefined();
    expect(bubble('I love you 7abibi')).toEqual({ show: true, reason: 'arabizi-fallback' });
  });
});

// Arabizi and leetspeak are written in Latin letters, so a Latin name inside Hebrew text is neither.
describe('a Hebrew block with one Latin name is not Arabizi', () => {
  it.each([
    'שלום לכולם, למדתי HTML באתר w3schools לפני הרבה שנים',
    'בדקו את הקובץ עם md5sum לפני ההתקנה',
  ])('%s', (text) => {
    expect(detectLang(text)?.id).toBeUndefined();
  });
});

// A chat line usually carries one Arabizi word.
describe('a single line of Arabizi is detected', () => {
  it.each([
    'ana b7ebak ktir',
    'ya3ni shu badak',
    '3ala rasi',
    'mar7aba, kifak?',
    'wayed 6ayeb w 7elw',
    'ana 3ayez ps4 w xbox1 ya 7abibi',
    'shu ra2yak bel galaxy s10 wala iphone11',
    'habibi I miss you, kifak? ana b7ebak',
    'el youm kan 7elw ktir',
  ])('%s', (text) => {
    expect(detectLang(text)?.id).toBe('arabizi');
  });
});

// 7 and 3 between consonants are vowel-less Arabizi as often as leet.
describe('vowel-less Arabizi is not leetspeak', () => {
  it.each(['7bibi 3mri', 'm3k 7mdlh', 'w7shtni ya 7bibi'])('%s', (text) => {
    expect(detectLang(text)?.id).not.toBe('leetspeak');
    expect(bubble(text).show).toBe(true);
  });
});

// Table cells and labels have no English words around them to decide.
describe('numbers in compounds, hex values and screen sizes are not leetspeak', () => {
  it.each([
    'COVID-19 / H1N1',
    '4-year-old, 10-year-old',
    '1920x1080 1280x720',
    '0x1F 0xdeadbeef',
    'My 4-year-old and my 10-year-old love this park.',
    'COVID-19 cases rose again, and H1N1 is back too.',
    'Set the screen to 1920x1080 or 1280x720.',
  ])('%s', (text) => {
    expect(detectLang(text)?.id).toBeUndefined();
  });
});

describe('leetspeak', () => {
  it.each(['g3t r3kt n00b', 'sup3r l33t sk1llz', '1337 h4x0r', 'y0u 4r3 pwn3d n00b', 'l33t-h4x0r'])(
    '%s',
    (text) => {
      expect(detectLang(text)?.id).toBe('leetspeak');
    },
  );
});

// An empty branch matches at every position.
describe('a custom pattern that can match empty text', () => {
  const custom: CustomLanguage = {
    id: preset('0c9d1b2a-3e4f-4a5b-8c6d-7e8f90a1b2c3'),
    label: 'Klingon',
    hint: 'test',
    examples: [],
    autoDetect: { regex: '\\b(nuqneH|Qapla|)\\b', flags: 'i', minScore: 2 },
    createdAt: 0,
  };

  it('does not claim plain English', () => {
    expect(detectLang('Hello, how are you today?', { customs: [custom] })).toBeUndefined();
  });

  it('still counts its real words', () => {
    expect(detectLang('nuqneH and Qapla friends', { customs: [custom] })?.id).toBe(custom.id);
  });

  it('safeCount skips empty matches', () => {
    expect(safeCount('(x)?', '', 'abc')).toBe(0);
    expect(safeCount('b', '', 'abcb')).toBe(2);
  });
});

describe('smart bubble', () => {
  // One symbol letter is not a foreign script.
  it.each([
    'The value of π is about 3.14',
    'The cell is 5 µm wide and thin',
    'Use a 10 kΩ resistor in the circuit',
  ])('stays hidden on English with one symbol letter: %s', (text) => {
    expect(bubble(text).show).toBe(false);
  });

  it.each(['مَرْحَبًا بِكُمْ', 'שָׁלוֹם עֲלֵיכֶם', 'Tokyo (東京) is big'])(
    'shows on a foreign script: %s',
    (text) => {
      expect(bubble(text)).toEqual({ show: true, reason: 'non-ascii' });
    },
  );

  // Two characters are a phrase in Chinese, Japanese and Korean.
  it.each(['谢谢你', 'こんにちは', '사랑해요'])('shows on a short CJK phrase: %s', (text) => {
    expect(bubble(text).show).toBe(true);
  });

  // Vowel-less and trailing-digit Arabizi words do not match the detector, but they are not English words either.
  it.each(['3ndk time bukra?', 'ok 3ndi a meeting', 'that was 3njad so good', 'I am 3al tari2'])(
    'shows on code-switched Arabizi: %s',
    (text) => {
      expect(bubble(text).show).toBe(true);
    },
  );

  it('hides on English that only mentions an mp3', () => {
    expect(looksLikeEnglish('Download the mp3 files here')).toBe(true);
  });
});
