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
    appendDelta(handle, '{"translation":"Tour de Tokyo"}');
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
    appendInlineDelta('r1', '{"translation":"bonjour le monde"');
    expect(w.getAttribute('lang')).toBe('fr');
    finishInline('r1', { confidence: 1 });
    w.dispatchEvent(new MouseEvent('mousedown'));
    expect(w.hasAttribute('lang')).toBe(false);
    w.dispatchEvent(new MouseEvent('mouseup'));
    expect(w.getAttribute('lang')).toBe('fr');
  });

  it('a rewrite stays in the input language', () => {
    const w = startInline('r2', { task: 'reword' });
    appendInlineDelta('r2', '{"translation":"hola, mundo"');
    expect(w.getAttribute('lang')).toBe('es');
  });

  it('an error shows the original without the mark', () => {
    const w = startInline('r3', {});
    appendInlineDelta('r3', '{"translation":"bonjour"');
    errorInline('r3', { code: 'NETWORK', message: 'x' });
    expect(w.hasAttribute('lang')).toBe(false);
  });
});
