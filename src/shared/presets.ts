import { asLangPresetIdUnsafe } from './brands';
import type { LangPreset, LangPresetId } from './types';

const pid = (s: string): LangPresetId => asLangPresetIdUnsafe(s);

export const BUILT_IN_PRESETS: readonly LangPreset[] = [
  {
    id: pid('arabizi'),
    label: 'Arabizi',
    hint: "Arabizi (aka Franco-Arabic / 3arabizi / Arabish) — Arabic written in Latin letters, with digits for sounds Latin lacks: 2=hamza, 3=ʿayn, 3'=ghayn, 5 or 7'=khāʾ, 6=ṭāʾ, 7=ḥāʾ, 9=ṣād, 9'=ḍād. 8 is qāf in the Gulf (Saudi texters also write qāf as 9) but ghayn in Lebanon; Levantine and Egyptian texters often write qāf as 2. Example dialects: Levantine, Egyptian, Gulf.",
    examples: [
      { src: 'mar7aba, kifak? shu 3am ta3mel?', tgt: 'Hi, how are you? What are you up to?' },
      { src: 'shu fi ma fi', tgt: "What's up?" },
      { src: 'ana b7ebak ktir', tgt: 'I love you a lot' },
    ],
    // One Arabizi-shaped word is enough: "7abibi" and "ta3mel" match; "2nd", "5pm", "B2B", "md5", "page2" and "usb3" do not.
    autoDetect: {
      regex:
        '\\b(?![a-z\\d]*\\d\\d)(?![a-z\\d]*\\d(?:s|ish)\\b)(?=[a-z\\d]*[a-z][a-z\\d]*[a-z][a-z\\d]*[a-z])(?=[a-z\\d]*[a-z]\\b)(?:[a-z]+[2356789]|[2356789][aeiou])[a-z\\d]*\\b',
      flags: 'i',
      minScore: 1,
    },
  },
  {
    id: pid('elvish-quenya'),
    label: 'Elvish (Quenya)',
    hint: "Quenya — the high-elven language from Tolkien. Note vowel marks and words like 'elen', 'síla', 'lúmenn''. Translate meaning plus, when natural, a short gloss of proper nouns.",
    examples: [
      { src: "Elen síla lúmenn' omentielvo", tgt: 'A star shines on the hour of our meeting' },
      { src: 'Namárië', tgt: 'Farewell' },
    ],
  },
  {
    id: pid('elvish-sindarin'),
    label: 'Elvish (Sindarin)',
    hint: "Sindarin — the Grey-elven language from Tolkien. Shorter words, more consonant clusters than Quenya ('mae govannen', 'mellon').",
    examples: [
      { src: 'Mae govannen', tgt: 'Well met' },
      { src: 'Mellon', tgt: 'Friend' },
    ],
  },
  {
    id: pid('leetspeak'),
    label: 'Leetspeak',
    hint: 'Leetspeak (1337) — digit/symbol substitutions for letters: 4=a, 3=e, 1=i/l, 0=o, 5=s, 7=t, $=s. Often gamer/hacker register.',
    examples: [
      { src: 'y0u 4r3 pwn3d n00b', tgt: 'You got owned, noob.' },
      { src: '1337 h4x0r', tgt: 'elite hacker' },
    ],
  },
  {
    id: pid('genz-slang'),
    label: 'Gen-Z slang',
    hint: 'Contemporary Gen-Z and TikTok slang (2023+), plus the Gen Alpha terms that ride along with it. Gen-Z: "delulu", "rizz", "ate and left no crumbs", "it\'s giving", "mid", "no cap". Gen Alpha: "skibidi", "fanum tax". Include nuance when context-dependent.',
    examples: [
      { src: 'she ate and left no crumbs fr fr', tgt: 'She did excellently, genuinely.' },
      { src: 'delulu is the solulu', tgt: 'Being delusional is the solution.' },
      { src: 'no cap that rizz is mid', tgt: 'Honestly, that charm is mediocre.' },
    ],
  },
  {
    id: pid('gaming-jargon'),
    label: 'Gaming jargon',
    hint: 'Multiplayer and MMO jargon: "GG", "AFK", "tank/healer/dps", "gank", "aggro", "proc", "meta", "nerf", "buff", "OOM", "LFG", plus game-specific terms like "ult", "farm", "lane".',
    examples: [
      {
        src: 'gank mid before their ult is up',
        tgt: 'Ambush the middle lane before their ultimate ability is ready.',
      },
      {
        src: 'tank is OOM, healer AFK, gg',
        tgt: 'Our defender is out of mana, healer is away-from-keyboard, good game (we lost).',
      },
    ],
  },
  {
    id: pid('fandom-jargon'),
    label: 'Fandom jargon',
    hint: 'Fan-community shorthand: "ship", "canon", "OTP", "AU", "BNF", "fluff", "angst", "crack-fic", "headcanon", "stan".',
    examples: [
      {
        src: 'my OTP is fanon but i stan',
        tgt: "My favorite pairing isn't canonical, but I'm a devoted fan.",
      },
      {
        src: 'this fic is pure fluff, no angst',
        tgt: 'This fan-fiction is entirely light-hearted with no emotional pain.',
      },
    ],
  },
  {
    id: pid('crypto-twitter'),
    label: 'Crypto-Twitter',
    hint: 'Crypto/web3 jargon: "gm", "wagmi", "ngmi", "hodl", "ape in", "rug pull", "degen", "alpha", "bags", "DYOR", "diamond hands", "paper hands".',
    examples: [
      {
        src: 'gm degens, dropped alpha in the discord, dyor',
        tgt: 'Good morning risk-seekers. I posted a tip in the Discord server — do your own research.',
      },
      {
        src: 'wagmi, diamond hands only, hodl through the dip',
        tgt: "We're all gonna make it — hold firmly through the price drop.",
      },
    ],
  },
  {
    id: pid('medical-jargon'),
    label: 'Medical jargon',
    hint: 'Clinical abbreviations: "SOB" (shortness of breath), "NAD" (no acute distress), "Rx", "dx", "hx", "MI", "CHF". Render them in plain, non-clinical language.',
    examples: [
      {
        src: 'Pt c/o SOB, hx of MI, NAD on exam',
        tgt: 'The patient complains of shortness of breath, has a history of heart attack, and shows no acute distress on examination.',
      },
      {
        src: 'dx: CHF. Rx diuretics.',
        tgt: 'Diagnosis: congestive heart failure. Prescription: diuretics.',
      },
    ],
  },
  {
    id: pid('legal-jargon'),
    label: 'Legal jargon',
    hint: 'Legal terms of art: "prima facie", "res ipsa loquitur", "mens rea", "voir dire", "in limine", "without prejudice". Render them in plain, non-legal language.',
    examples: [
      {
        src: 'The motion in limine was granted without prejudice.',
        tgt: 'The pre-trial motion to exclude evidence was granted, but can be reconsidered later.',
      },
      {
        src: 'Prima facie, the prosecution has shown mens rea.',
        tgt: 'On first look, the prosecution has shown the defendant had a guilty state of mind.',
      },
    ],
  },
];

const byId = new Map<string, LangPreset>(BUILT_IN_PRESETS.map((p) => [p.id, p]));

export function getPreset(id: string): LangPreset | undefined {
  return byId.get(id);
}
