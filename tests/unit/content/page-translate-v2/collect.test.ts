// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { collectBlocks, MAX_PAGE_BLOCKS, releaseOrder } from '@/content/page-translate-v2/collect';

function ids(els: HTMLElement[]): string[] {
  return els.map((e) => e.id);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('collectBlocks', () => {
  it('takes text blocks in document order, innermost first', () => {
    document.body.innerHTML = `
      <h1 id="h">Bonjour le monde</h1>
      <ul><li id="li1">Premier point</li><li><p id="lip">Paragraphe dans un point</p></li></ul>
      <table><tr><td id="td">Cellule de tableau</td></tr></table>
      <blockquote id="q">Une citation célèbre</blockquote>
      <div id="div">Texte libre dans une div <a href="#">avec un lien</a></div>
      <p id="p">Dernier paragraphe <em>avec emphase</em></p>`;
    expect(ids(collectBlocks(document.body, { maxChars: 2000 }))).toEqual([
      'h',
      'li1',
      'lip',
      'td',
      'q',
      'div',
      'p',
    ]);
  });

  it('skips every kind of text the spec keeps out', () => {
    document.body.innerHTML = `
      <p id="keep">Un paragraphe à traduire</p>
      <p hidden>Caché par attribut</p>
      <p style="display:none">Caché par style</p>
      <p style="visibility:hidden">Invisible</p>
      <p aria-hidden="true">Masqué aux lecteurs</p>
      <pre>du code préformaté</pre>
      <p><code>const x = 1</code></p>
      <script>var a = "texte"</script>
      <style>p { color: red }</style>
      <textarea>Un champ de saisie</textarea>
      <div contenteditable="true"><p>Zone modifiable</p></div>
      <p translate="no">Ne pas traduire</p>
      <div class="notranslate"><p>Pas non plus</p></div>
      <p><input type="password" value="secret"></p>
      <p>42</p>
      <p>A</p>
      <p data-ega-replaced="x">Déjà traduit</p>
      <div data-ega-tx>Déjà traduit aussi</div>
      <p id="long">${'mot '.repeat(30)}</p>`;
    expect(ids(collectBlocks(document.body, { maxChars: 50 }))).toEqual(['keep']);
  });

  it('a block over the length cap keeps its container from claiming it', () => {
    document.body.innerHTML = `<div id="d">Texte propre <p>${'mot '.repeat(30)}</p></div>`;
    expect(collectBlocks(document.body, { maxChars: 50 })).toEqual([]);
  });

  it('stops at the block cap', () => {
    document.body.innerHTML = Array.from(
      { length: MAX_PAGE_BLOCKS + 5 },
      (_, i) => `<p>Paragraphe numéro ${i}</p>`,
    ).join('');
    expect(collectBlocks(document.body, { maxChars: 2000 })).toHaveLength(MAX_PAGE_BLOCKS);
  });
});

describe('releaseOrder', () => {
  it('releases in page order, each block once', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 50 })), (near) => {
        const out = releaseOrder(near);
        expect(out).toEqual([...new Set(near)].sort((a, b) => a - b));
        for (let i = 1; i < out.length; i++) expect(out[i - 1]).toBeLessThan(out[i] ?? 0);
      }),
    );
  });
});
