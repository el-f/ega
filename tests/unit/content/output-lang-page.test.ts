// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mountBilingual,
  mountInplace,
  appendDelta,
  finish,
  mountError,
} from '@/content/page-translate-v2/renderer';
import {
  openInline,
  appendInlineDelta,
  finishInline,
  errorInline,
  restoreAllInline,
} from '@/content/inlineReplace';
import { pending, type PendingReq } from '@/content/request-state';
import { asLangSelection } from '@/shared/brands';
import { runPageTranslateV2, cancelPageTranslateV2 } from '@/content/page-translate-v2';
import { deps, flush } from '@tests/_helpers/page-translate';

function block(text: string): HTMLElement {
  document.body.innerHTML = `<p id="orig">${text}</p>`;
  const el = document.getElementById('orig');
  if (!el) throw new Error('orig missing');
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('page translate — a translated block carries the target language', () => {
  it('a bilingual sibling is marked, and an error drops the mark', () => {
    const original = block('東京タワー');
    const handle = mountBilingual({
      id: 'b-1',
      element: original,
      originalText: '東京タワー',
      lang: 'fr',
    });
    expect(handle.target.getAttribute('lang')).toBe('fr');
    mountError(handle, { code: 'NETWORK', message: 'x' });
    expect(handle.target.hasAttribute('lang')).toBe(false);
  });

  it('an in-place wrapper is marked while it shows the translation, not the original', () => {
    const original = block('東京タワー');
    const handle = mountInplace({
      id: 'b-2',
      element: original,
      originalText: '東京タワー',
      lang: 'fr',
    });
    appendDelta(handle, 'Tour de Tokyo');
    finish(handle);
    expect(handle.target.getAttribute('lang')).toBe('fr');
    handle.target.dispatchEvent(new MouseEvent('mousedown'));
    expect(handle.target.textContent).toBe('東京タワー');
    expect(handle.target.hasAttribute('lang')).toBe(false);
    handle.target.dispatchEvent(new MouseEvent('mouseup'));
    expect(handle.target.getAttribute('lang')).toBe('fr');
  });

  it('an in-place error puts the original back without the mark', () => {
    const original = block('東京タワー');
    const handle = mountInplace({
      id: 'b-3',
      element: original,
      originalText: '東京タワー',
      lang: 'fr',
    });
    mountError(handle, { code: 'NETWORK', message: 'x' });
    expect(handle.target.hasAttribute('lang')).toBe(false);
  });

  it('no tag, no mark', () => {
    const handle = mountBilingual({ id: 'b-4', element: block('x'), originalText: 'x' });
    expect(handle.target.hasAttribute('lang')).toBe(false);
  });

  it('the session marks every block with the target it sends', async () => {
    document.body.innerHTML = '<p id="a">これは日本語の段落です。</p>';
    await runPageTranslateV2({
      ...deps({}, { pageTranslateMode: 'bilingual' }),
      target: 'de',
    });
    document.getElementById('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(document.querySelector('[data-ega-tx]')?.getAttribute('lang')).toBe('de');
    await cancelPageTranslateV2();
  });
});

describe('inline replace — the wrapper is marked only while it shows the translation', () => {
  afterEach(() => {
    restoreAllInline();
    pending.clear();
  });

  function startInline(id: string, req: Partial<PendingReq>): HTMLElement {
    const p = block('hola mundo');
    pending.set(id, {
      id,
      text: 'hola mundo',
      rect: new DOMRect(),
      sourceLang: asLangSelection('es'),
      targetLang: asLangSelection('fr'),
      direction: { source: asLangSelection('es'), target: asLangSelection('fr') },
      ...req,
    });
    const range = document.createRange();
    range.selectNodeContents(p);
    openInline({ requestId: id, range, stuckTimeoutMs: 90_000 });
    const w = p.querySelector<HTMLElement>('[data-ega-replaced]');
    if (!w) throw new Error('wrapper missing');
    return w;
  }

  it('the dimmed original carries no mark; the translation does', () => {
    const w = startInline('r1', {});
    expect(w.hasAttribute('lang')).toBe(false);
    appendInlineDelta('r1', 'bonjour le monde');
    expect(w.getAttribute('lang')).toBe('fr');
    finishInline('r1', { confidence: 1 });
    w.dispatchEvent(new MouseEvent('mousedown'));
    expect(w.hasAttribute('lang')).toBe(false);
    w.dispatchEvent(new MouseEvent('mouseup'));
    expect(w.getAttribute('lang')).toBe('fr');
  });

  it('a rewrite stays in the input language', () => {
    const w = startInline('r2', { task: 'reword' });
    appendInlineDelta('r2', 'hola, mundo');
    expect(w.getAttribute('lang')).toBe('es');
  });

  it('an error shows the original without the mark', () => {
    const w = startInline('r3', {});
    appendInlineDelta('r3', 'bonjour');
    errorInline('r3', { code: 'NETWORK', message: 'x' });
    expect(w.hasAttribute('lang')).toBe(false);
  });
  it('an RTL target lays the translation out right to left, even when it starts with a Latin word', () => {
    const w = startInline('r4', { targetLang: asLangSelection('he') });
    expect(w.getAttribute('dir')).toBe('auto');
    appendInlineDelta('r4', 'iPhone 15 יוצא היום.');
    expect(w.getAttribute('dir')).toBe('rtl');
    finishInline('r4', { confidence: 1 });
    w.dispatchEvent(new MouseEvent('mousedown'));
    expect(w.getAttribute('dir')).toBe('auto');
  });
});

describe('page translate — an RTL target reads right to left, even when it starts with a Latin word', () => {
  it('Show both: rtl once the translation shows', () => {
    const handle = mountBilingual({
      id: 'd-1',
      element: block('Hello'),
      originalText: 'Hello',
      lang: 'he',
    });
    appendDelta(handle, 'iPhone 15 יוצא היום.');
    expect(handle.target.getAttribute('dir')).toBe('rtl');
  });

  it.each([
    ['Show both', mountBilingual],
    ['Replace text', mountInplace],
  ])('%s: an error box holds only the chip, so it takes the page direction', (_, mount) => {
    const failed = mount({ id: 'd-2', element: block('Hi'), originalText: 'Hi', lang: 'he' });
    appendDelta(failed, 'iPhone');
    mountError(failed, { code: 'NETWORK', message: 'x' });
    expect(failed.target.hasAttribute('dir')).toBe(false);
  });

  it('Replace text: auto while the page words show (pending, peek), rtl for the translation', () => {
    const handle = mountInplace({
      id: 'd-3',
      element: block('Hello world'),
      originalText: 'Hello world',
      lang: 'ar',
    });
    expect(handle.target.getAttribute('dir')).toBe('auto');
    appendDelta(handle, 'Google تعلن اليوم');
    finish(handle);
    expect(handle.target.getAttribute('dir')).toBe('rtl');
    handle.target.dispatchEvent(new MouseEvent('mousedown'));
    expect(handle.target.getAttribute('dir')).toBe('auto');
    handle.target.dispatchEvent(new MouseEvent('mouseup'));
    expect(handle.target.getAttribute('dir')).toBe('rtl');
  });

  it.each([
    ['fa', 'rtl'],
    ['ur', 'rtl'],
    ['yi', 'rtl'],
    ['ar-Latn', 'auto'],
    ['fr', 'auto'],
    [undefined, 'auto'],
  ])('target %s gives dir=%s', (lang, dir) => {
    const handle = mountBilingual({
      id: 'd-4',
      element: block('Hello'),
      originalText: 'Hello',
      lang,
    });
    appendDelta(handle, 'Brand X');
    expect(handle.target.getAttribute('dir')).toBe(dir);
  });
});
