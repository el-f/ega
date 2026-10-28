// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectLang } from '@/content/detect';
import {
  lexiconCacheInternal,
  loadEnglishLexicon,
  looksLikeEnglishBlock,
} from '@/content/looks-like-english';
import { shouldShowBubbleWithReason } from '@/content/should-show-bubble';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import {
  ARABIZI_LINES,
  ENGLISH_LINES,
  LEET_LINES,
  OTHER_LATIN_LINES,
  OTHER_SCRIPT_LINES,
} from '@tests/fixtures/detect-corpus';

type Want = 'arabizi' | 'leetspeak' | undefined;

const CORPUS: readonly (readonly [string, Want])[] = [
  ...ARABIZI_LINES.map((t) => [t, 'arabizi'] as const),
  ...LEET_LINES.map((t) => [t, 'leetspeak'] as const),
  ...ENGLISH_LINES.map((t) => [t, undefined] as const),
  ...OTHER_SCRIPT_LINES.map((t) => [t, undefined] as const),
  ...OTHER_LATIN_LINES.map((t) => [t, undefined] as const),
];

const SHORT_WORD =
  'the shipped pattern skips a digit word with two letters or a final digit: English writes 3am, 5pm and mp3 the same way';
const TIE = 'the English words tie the Arabizi or leet evidence, so the line goes out as auto';
const LEET_SCORE = 'fewer than two leet words: "0mg", "s0" and "4m" read as a unit or a version';
const ONE_WEAK =
  'one Arabizi-shaped word with no vowel beside its digit is as often a name ("7zip", "md5sum"); "ma" and "shu" do not make up the second point, as Italian and French write "ma" too';

const AYN_OR_HA_PAIR =
  'two names that start with 3 or 7 and a consonant, with no other word, look like Egyptian "3leik 3shan"';

/** Each line the detector gets wrong, with the reason. */
const ACCEPTED_MISSES: ReadonlyMap<string, string> = new Map([
  ['rou7 nem ya zalame', SHORT_WORD],
  ['wain ra7 el 7in?', SHORT_WORD],
  ['bro wen enta? 3am estanak', SHORT_WORD],
  ['hi, kifak? 3am fakker fik', SHORT_WORD],
  ['el exam kan 9a3b wallah', SHORT_WORD],
  ['3am fakker ruh 3al gym', SHORT_WORD],
  ['mabrouk 3al wazife el jdide', SHORT_WORD],
  ['9ar lna zaman ma shefnak', SHORT_WORD],
  ['lol shu 3melt?', ONE_WEAK],
  ['sorry ma 2deret ejeh', ONE_WEAK],
  ['wallahi ma 3reft', ONE_WEAK],
  ['b7bk', ONE_WEAK],
  ['3reft', ONE_WEAK],
  ['m3lsh', ONE_WEAK],
  ['t3mel?', ONE_WEAK],
  ['w7shtni', ONE_WEAK],
  ['ok 3reft', ONE_WEAK],
  ['sorry b7bk', ONE_WEAK],
  ['ok t3mel', ONE_WEAK],
  ['ok w7shtni', ONE_WEAK],
  ['thanks, 3reft', ONE_WEAK],
  ['3dmax 3dsmax', AYN_OR_HA_PAIR],
  ['I am so ta3ban today ya 3am', TIE],
  ['pwn3d by a n00b lol', TIE],
  ['0mg u r s0 l4m3', LEET_SCORE],
  ['u r s0 n00b', LEET_SCORE],
  ['1 4m 7h3 b357', LEET_SCORE],
]);

const classify = (): (string | undefined)[] => CORPUS.map(([text]) => detectLang(text)?.id);

describe('the detector on the labeled corpus', () => {
  it('has enough lines of each kind', () => {
    expect(ARABIZI_LINES.length).toBeGreaterThanOrEqual(60);
    expect(ENGLISH_LINES.length).toBeGreaterThanOrEqual(60);
    expect(LEET_LINES.length).toBeGreaterThanOrEqual(15);
  });

  it('gets every line right except the accepted misses', () => {
    const got = classify();
    const misses = CORPUS.filter(([, want], i) => got[i] !== want).map(([text]) => text);
    expect(misses.sort()).toEqual([...ACCEPTED_MISSES.keys()].sort());
  });

  it('still shows the bubble on each line it misses', () => {
    const smart = { ...DEFAULT_SETTINGS, bubbleMode: 'smart' as const };
    const hidden = [...ACCEPTED_MISSES.keys()].filter(
      (text) => !shouldShowBubbleWithReason({ text }, smart, []).show,
    );
    expect(hidden).toEqual([]);
  });

  describe('with the English lexicon loaded', () => {
    let before: (string | undefined)[] = [];
    beforeAll(async () => {
      before = classify();
      await loadEnglishLexicon();
    });
    afterAll(() => {
      lexiconCacheInternal.mod = null;
      lexiconCacheInternal.promise = null;
    });

    it('gives the same answer for every line', () => {
      expect(lexiconCacheInternal.mod).not.toBeNull();
      const after = classify();
      const changed = CORPUS.filter((_, i) => after[i] !== before[i]).map(([text]) => text);
      expect(changed).toEqual([]);
    });

    // Page translate with target English skips a block when detectLang names no variety and this check passes.
    const pageSkips = (text: string): boolean =>
      detectLang(text) === undefined && looksLikeEnglishBlock(text);

    it('never lets page translate skip an Arabizi line as English', () => {
      expect(ARABIZI_LINES.filter(pageSkips)).toEqual([]);
    });

    it('still lets page translate skip a short English block with one tool name', () => {
      const short = [
        'Run md5sum now',
        'Check the md5sum',
        's3cmd docs',
        'md5sum usage',
        'c3po figure',
      ];
      expect(short.every((t) => ENGLISH_LINES.includes(t))).toBe(true);
      expect(short.filter((t) => !pageSkips(t))).toEqual([]);
    });
  });
});
