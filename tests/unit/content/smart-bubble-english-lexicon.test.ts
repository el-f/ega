import { beforeAll, describe, it, expect } from 'vitest';
import { readsAsEnglish } from '@/content/english-lexicon';
import raw from '@/content/english-lexicon.txt?raw';
import { loadEnglishLexicon, looksLikeEnglish } from '@/content/looks-like-english';
import { shouldShowBubbleWithReasonAsync } from '@/content/should-show-bubble';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { CustomLanguage } from '@/shared/types';

const smart = { ...DEFAULT_SETTINGS, bubbleMode: 'smart' as const };
// The length gate runs before the English check; a floor of 1 lets short Arabizi ("yalla") reach it.
const smartNoFloor = { ...smart, smartBubbleMinLength: 1 };
const noCustoms: CustomLanguage[] = [];

const shows = async (text: string, settings = smart): Promise<boolean> =>
  (await shouldShowBubbleWithReasonAsync({ text }, settings, noCustoms)).show;

const ENGLISH_HEADINGS = [
  'Recently',
  'HOMEMADE BURGERS',
  'Opening hours',
  'Book a table',
  'surprisingly affordable',
  'Our Menu',
  'Contact us',
  'About us',
  'Privacy policy',
  'Terms of service',
  'Sign in to continue',
  'Free shipping on orders over $50',
  'Add to cart',
  'Read more',
  'Subscribe to our newsletter',
  'Frequently asked questions',
  'Customer reviews',
  'Related articles',
  'Share this post',
  'Leave a comment',
  'Fresh salads and sandwiches',
  'Breakfast served daily',
  'Order online',
  'Gift cards',
  "Today's specials",
  'Upcoming events',
  'Latest news',
  'Load more comments',
  'Delicious',
  'Unfortunately',
  'Highly recommended',
  'Back to top',
  'View all products',
  'Forgot your password?',
  'Weekly deals',
  "We're open seven days a week",
  "Don't miss our summer sale",
  'Lunch Specials',
  'we visited Paris last summer',
];

const ARABIZI = [
  'ya ana',
  'kif halak',
  'yalla',
  'habibi',
  'wallah ya habibi',
  'ana bas',
  'shu badak',
  'Min hayde',
  'hayde',
  'yarayt rase fade add rasak',
  'kif halak ya habibi',
  'shu badak men hal mawdou',
  'ana bhebbak kteer ktir',
  'ma baaref shu sar',
  'rou7 nem ya zalame',
  '3eyzina w 3adi ya habibi',
  'mar7aba, kifak? shu 3am ta3mel?',
  'e5wet l jiran ma byeltezmo b aya deal',
  'keef 7alak ya 7abibi',
  'el 2a3de kanet 7elwe bas el jaw 7ar ktir',
  'ahlan wa sahlan, kif halak',
  'ahlan',
  'ahlan sadeeqi',
  'ahlan w sahlan',
  'ana bahibbak',
  'kapara aleha ya zalame',
  'kayf halak',
  'kifak',
  'marhaba ya habibi',
  'marhaba ya habibi kif halak el yom, kol shi tamam?',
  'marhaba ya sadiqi',
  'marhaba kif 7alak',
  'shu fi ma fi',
  'shukran',
  'shukran jazilan',
  'ya salam',
  'yalla habibi',
  'mar7aba habibi',
  'sabah el kheir ya jama3a',
  'wayed 6ayeb w 7elw',
  'w7shtni ya 7bibi',
  'ana 3ayez ps4 w xbox1 ya 7abibi',
  'shu ra2yak bel galaxy s10 wala iphone11',
  'yalla ma3ak shi 7elow ktir 3njad',
  'ya3ni shu badak',
  'kif halak ya habibi, shu 3am ta3mel?',
  'Yalla Habibi',
  'Ana Bahibbak',
  'ana mesh fahem',
  'bad el shoghl',
  'men fadlak',
  'add eh',
  'enta fein',
  'inta wein',
  'ana fi el bet',
  'ma fi shi',
  'law samaht',
  'tab yalla',
];

const PRESET_EXAMPLES = BUILT_IN_PRESETS.filter((p) => p.id === 'arabizi').flatMap((p) =>
  p.examples.map((e) => e.src),
);

const OTHER = [
  'ma fish had',
  'fen el bet',
  'anti fen',
  'sale chat',
  'mare e sole',
  'salsa picante',
  'hum log',
  'bonjour',
  'merci beaucoup',
  'gracias amigo',
  'elen sila lumenn omentielvo',
  'elen sila lumenn omentielvo meldir',
  'this rizz is bussin fr no cap',
];

// Short phrases a lone 3+ letter English word used to decide; none of them is English.
const SHORT_NON_ENGLISH = [
  'ya rabbi',
  'ya sheikh',
  'ya pasha',
  'ya imam',
  'ya sultan',
  'ya mama',
  'ma fi had',
  'ma fish',
  'ma fish had',
  'fen el bet',
  'anti fen',
  'hum fen',
  'fen Ali',
  'el mar',
  'la red',
  'el sol',
  'mi mesa',
  'con pan',
  'el mayor',
  'salsa picante',
  'le chat',
  'la main',
  'sale chat',
  'mare e sole',
  'la dove',
  'ken ken',
  'ma ken',
  'hum log',
];

// A cold import of the 600 KB lexicon can outrun the 300 ms wait, and the first test would read the fallback list.
beforeAll(async () => {
  await loadEnglishLexicon();
});

describe('english lexicon — short non-English phrases read as not English', () => {
  for (const text of SHORT_NON_ENGLISH) {
    it(`not English: ${JSON.stringify(text)}`, () => {
      expect(looksLikeEnglish(text)).toBe(false);
    });
  }
});

describe('english lexicon — a two-letter particle is weak proof', () => {
  // Particles in Hindi, Persian, Vietnamese, Turkish, German: each partner word is in the English list.
  for (const text of [
    'us din',
    'do pal',
    'to man',
    'man in',
    'cam on',
    'on gun',
    'in arm',
    "auto's",
  ]) {
    it(`not English: ${JSON.stringify(text)}`, () => {
      expect(looksLikeEnglish(text)).toBe(false);
    });
  }
  for (const text of ['Shop now', 'View all', 'Log out', 'Sign in', 'Add to cart', 'Back to top']) {
    it(`English: ${JSON.stringify(text)}`, () => {
      expect(looksLikeEnglish(text)).toBe(true);
    });
  }
});

describe('english lexicon — a short word with an apostrophe', () => {
  it('reads "it\'s late" as English, though two-letter words are not in the list', () => {
    expect(looksLikeEnglish("it's late")).toBe(true);
    expect(looksLikeEnglish('it’s late')).toBe(true);
  });
});

describe('english lexicon — binary search finds every word', () => {
  const lines = raw.split('\n').filter((l) => l !== '' && !l.startsWith('#'));
  const common = lines.filter((l) => !l.startsWith('~') && l.length >= 5);
  const ambiguous = lines.filter((l) => l.startsWith('~')).map((l) => l.slice(1));

  it('reads every common word of five letters or more as English, and a near miss as not', () => {
    expect(common.length).toBeGreaterThan(40000);
    expect(common.filter((w) => !readsAsEnglish(w, /^\d+$/))).toEqual([]);
    expect(common.filter((w) => readsAsEnglish(`${w}qx`, /^\d+$/))).toEqual([]);
  });

  it('reads every bare common four-letter word as English on its own', () => {
    const four = lines.filter((l) => !l.startsWith('~') && l.length === 4);
    expect(four.length).toBeGreaterThan(1000);
    expect(four.filter((w) => !readsAsEnglish(w, /^\d+$/))).toEqual([]);
  });

  it('reads an ambiguous word as neither side', () => {
    expect(ambiguous).toContain('sheikh');
    expect(ambiguous.filter((w) => readsAsEnglish(w, /^\d+$/))).toEqual([]);
  });
});

describe('smart bubble — four letters at default settings', () => {
  for (const text of ['Menu', 'Home', 'Sale', 'Help', 'Save', 'Edit', 'also', 'just']) {
    it(`hides a lone common word: ${JSON.stringify(text)}`, async () => {
      expect(await shouldShowBubbleWithReasonAsync({ text }, smart, noCustoms)).toEqual({
        show: false,
        reason: 'english',
      });
    });
  }
  for (const text of ['yalla', 'tamam', 'mashi', 'inta', 'wein', 'ktir', 'akid', '3ala']) {
    it(`shows short Arabizi: ${JSON.stringify(text)}`, async () => {
      expect(await shows(text)).toBe(true);
    });
  }
  // A lone word proves English at four letters; its 's form and a short phrase still need five (99049a2).
  for (const text of ["auto's", "menu's", 'sale chat', 'home page']) {
    it(`still shows: ${JSON.stringify(text)}`, async () => {
      expect(await shows(text)).toBe(true);
    });
  }
});

describe('smart bubble — English that must hide', () => {
  for (const text of ENGLISH_HEADINGS) {
    it(`hides: ${JSON.stringify(text)}`, async () => {
      expect(await shows(text)).toBe(false);
    });
  }
});

describe('smart bubble — Arabizi that must show', () => {
  it('has preset examples to check', () => {
    expect(PRESET_EXAMPLES.length).toBeGreaterThan(0);
  });
  for (const text of [...ARABIZI, ...PRESET_EXAMPLES]) {
    it(`shows: ${JSON.stringify(text)}`, async () => {
      expect(await shows(text, smartNoFloor)).toBe(true);
    });
  }
});

describe('smart bubble — other non-English that must show', () => {
  for (const text of OTHER) {
    it(`shows: ${JSON.stringify(text)}`, async () => {
      expect(await shows(text)).toBe(true);
    });
  }
});
