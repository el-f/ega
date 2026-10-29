// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const showToastMock = vi.fn();
vi.mock('@/content/toast', () => ({
  showToast: (...a: unknown[]) => showToastMock(...a),
  dismissToast: vi.fn(),
}));

import {
  runWholePageTranslate,
  runPageTranslateV2,
  cancelPageTranslateV2,
} from '@/content/page-translate-v2';
import { MAX_SELECTION_CHARS } from '@/shared/constants';
import { FakeObserver, flush, rig, type PageRig } from '@tests/_helpers/page-translate';

beforeEach(async () => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  showToastMock.mockClear();
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  vi.unstubAllGlobals();
});

function paragraphs(texts: string[]): HTMLElement[] {
  document.body.innerHTML = texts.map((t, i) => `<p id="p${i}">${t}</p>`).join('');
  return texts.map((_, i) => document.getElementById(`p${i}`) as HTMLElement);
}

/** Whole page with the real target-language check (the rig stubs it out), every block near the viewport. */
async function sentFor(
  target: string | undefined,
  texts: string[],
  over: Partial<PageRig['d']> = {},
): Promise<{ sent: string[]; r: PageRig }> {
  const els = paragraphs(texts);
  const r = rig();
  delete r.d.isTargetLanguage;
  if (target !== undefined) r.d.target = target;
  Object.assign(r.d, over);
  await runWholePageTranslate(r.d);
  FakeObserver.last?.band(new Set(els));
  await flush();
  return { sent: r.sent.map((s) => s.text), r };
}

describe('whole page — blocks already in the target language, by script', () => {
  const HEBREW = 'זהו משפט שלם בעברית';
  const ENGLISH = 'The weather is nice today in the city';

  it('skips Hebrew text on a Hebrew target and sends the English text', async () => {
    const { sent, r } = await sentFor('he', [HEBREW, ENGLISH]);
    expect(sent).toEqual([ENGLISH]);
    expect(r.updates.at(-1)?.total).toBe(1);
  });

  it('judges nothing when the page has no target language', async () => {
    const { sent } = await sentFor(undefined, [HEBREW, ENGLISH]);
    expect(sent).toEqual([HEBREW, ENGLISH]);
  });

  it('skips Korean on a Korean target (Hangul) and Greek on a Greek target', async () => {
    expect((await sentFor('ko', ['안녕하세요 여러분', ENGLISH])).sent).toEqual([ENGLISH]);
    await cancelPageTranslateV2();
    expect((await sentFor('el', ['Καλημέρα σε όλους', ENGLISH])).sent).toEqual([ENGLISH]);
  });

  it('a Latin name or two inside a Hebrew sentence does not make it foreign (8 of 10 letters)', async () => {
    const { sent } = await sentFor('he', ['אבגדהוזח ab']);
    expect(sent).toEqual([]);
  });

  it('a sentence with only 7 of 10 letters in the target script is still sent', async () => {
    const { sent } = await sentFor('he', ['אבגדהוז abc']);
    expect(sent).toEqual(['אבגדהוז abc']);
  });

  it.each([
    ['ru', 'Это полное предложение на русском'],
    ['ar', 'هذه جملة كاملة باللغة العربية'],
    ['hi', 'यह हिंदी में पूरा वाक्य है'],
    ['fr', 'Ceci est une phrase complète en français'],
  ])(
    '%s shares its script with other offered languages, so its text is not judged',
    async (target, text) => {
      const { sent } = await sentFor(target, [text]);
      expect(sent).toEqual([text]);
    },
  );

  it('a custom language id is not judged by script', async () => {
    const { sent } = await sentFor('x-klingon', [HEBREW]);
    expect(sent).toEqual([HEBREW]);
  });
});

describe('whole page — blocks already in the target language, by detector', () => {
  it('the detector decides: its target skips the block, another language sends it', async () => {
    const detect = (t: string): string | undefined => (t.startsWith('Bonjour') ? 'fr' : 'de');
    const { sent } = await sentFor('fr', ['Bonjour tout le monde', 'Guten Tag alle zusammen'], {
      detectLang: detect,
    });
    expect(sent).toEqual(['Guten Tag alle zusammen']);
  });

  it('the detector beats the script check', async () => {
    const { sent } = await sentFor('he', ['זהו משפט שלם בעברית'], { detectLang: () => 'en' });
    expect(sent).toEqual(['זהו משפט שלם בעברית']);
  });

  it('on an English target the detector beats the word list', async () => {
    const { sent } = await sentFor(
      'en',
      ['Das ist ein deutscher Satz', 'This looks like English'],
      {
        detectLang: (t) => (t.startsWith('Das') ? 'en' : 'fr'),
        looksLikeEnglish: (t) => t.startsWith('This'),
      },
    );
    expect(sent).toEqual(['This looks like English']);
  });
});

describe('whole page — English target without a detector', () => {
  const english = { looksLikeEnglish: () => true };

  it('skips text the word list reads as English', async () => {
    const { sent } = await sentFor('en', ['Hello there my friend'], english);
    expect(sent).toEqual([]);
  });

  it('sends text the word list does not read as English', async () => {
    const { sent } = await sentFor('en', ['Hola amigo mío'], { looksLikeEnglish: () => false });
    expect(sent).toEqual(['Hola amigo mío']);
  });

  it('sends text without a word list: nothing reads as English', async () => {
    const { sent } = await sentFor('en', ['Hello there my friend']);
    expect(sent).toEqual(['Hello there my friend']);
  });

  it('two letters outside the Latin script are never English, whatever the word list says', async () => {
    const { sent } = await sentFor('en', ['ΩΩ'], english);
    expect(sent).toEqual(['ΩΩ']);
  });

  it('a single foreign letter in English text is still English', async () => {
    const { sent } = await sentFor('en', ['Hello Ω there'], english);
    expect(sent).toEqual([]);
  });
});

describe('whole page — a block the page changed before it came near', () => {
  const long = (n: number): string => `${'あ'.repeat(n - 1)}。`;

  it('sends a block of exactly the size limit', async () => {
    const [el] = paragraphs(['placeholder text here']);
    const r = rig();
    await runWholePageTranslate(r.d);
    (el as HTMLElement).textContent = long(MAX_SELECTION_CHARS);
    FakeObserver.last?.band(new Set([el as HTMLElement]));
    await flush();
    expect(r.sent).toHaveLength(1);
    expect(r.updates.at(-1)?.tooLong).toBeUndefined();
  });

  it('a block of exactly the size limit that reads as the target is not counted as too long', async () => {
    const els = paragraphs(['placeholder text here', 'another paragraph here']);
    const r = rig();
    r.d.isTargetLanguage = (t) => t.length === MAX_SELECTION_CHARS;
    await runWholePageTranslate(r.d);
    (els[0] as HTMLElement).textContent = long(MAX_SELECTION_CHARS);
    FakeObserver.last?.band(new Set(els));
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual(['another paragraph here']);
    expect(r.updates.at(-1)).toMatchObject({ total: 1 });
    expect(r.updates.at(-1)?.tooLong).toBeUndefined();
  });

  it('a block that grew past the limit is left out and counted as too long', async () => {
    const els = paragraphs(['placeholder text here', 'another paragraph here']);
    const r = rig();
    await runWholePageTranslate(r.d);
    (els[0] as HTMLElement).textContent = long(MAX_SELECTION_CHARS + 1);
    FakeObserver.last?.band(new Set(els));
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual(['another paragraph here']);
    expect(r.updates.at(-1)).toMatchObject({ total: 1, tooLong: 1 });
  });

  it('a block the page emptied is left out of the count and is not counted as too long', async () => {
    const els = paragraphs(['placeholder text here', 'another paragraph here']);
    const r = rig();
    await runWholePageTranslate(r.d);
    (els[0] as HTMLElement).textContent = '';
    FakeObserver.last?.band(new Set(els));
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual(['another paragraph here']);
    expect(r.updates.at(-1)).toMatchObject({ total: 1 });
    expect(r.updates.at(-1)?.tooLong).toBeUndefined();
  });
});

describe('Choose areas — an area the page changed after it was picked', () => {
  const long = (n: number): string => `${'あ'.repeat(n - 1)}。`;

  async function pickAndFire(els: HTMLElement[], r: PageRig, change: () => void): Promise<void> {
    await runPageTranslateV2(r.d);
    for (const el of els) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    change();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
  }

  it('sends an area of exactly the size limit and drops the one that grew past it or emptied', async () => {
    const els = paragraphs([
      'first area text',
      'second area text',
      'third area text',
      'fourth one here',
    ]);
    const r = rig();
    await pickAndFire(els, r, () => {
      (els[0] as HTMLElement).textContent = long(MAX_SELECTION_CHARS);
      (els[1] as HTMLElement).textContent = long(MAX_SELECTION_CHARS + 1);
      (els[2] as HTMLElement).textContent = '';
    });
    expect(r.sent.map((s) => s.text)).toEqual([long(MAX_SELECTION_CHARS), 'fourth one here']);
    expect(r.updates.at(-1)).toMatchObject({ total: 2 });
  });

  it('says so when no chosen area has anything left to send', async () => {
    const els = paragraphs(['first area text', 'second area text']);
    const r = rig();
    await pickAndFire(els, r, () => {
      (els[0] as HTMLElement).textContent = '';
      (els[1] as HTMLElement).textContent = long(MAX_SELECTION_CHARS + 1);
    });
    expect(r.sent).toHaveLength(0);
    expect(showToastMock).toHaveBeenCalledWith('Nothing to translate in the chosen areas.');
  });
});
