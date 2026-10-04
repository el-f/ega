import { describe, it, expect } from 'vitest';
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
  'bonjour',
  'merci beaucoup',
  'gracias amigo',
  'elen sila lumenn omentielvo',
  'elen sila lumenn omentielvo meldir',
  'this rizz is bussin fr no cap',
];

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
