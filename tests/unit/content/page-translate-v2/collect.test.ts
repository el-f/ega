// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  blockText,
  collectBlocks,
  MAX_PAGE_BLOCKS,
  releaseOrder,
} from '@/content/page-translate-v2/collect';

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

const collect = (): HTMLElement[] => collectBlocks(document.body, { maxChars: 2000 });

describe('collectBlocks — what is already translated, and what can never come near', () => {
  it('takes a container whose text sits only inside inline children', () => {
    document.body.innerHTML = `
      <div id="tweet"><span>Hola a todos, qué tal</span></div>
      <div id="card"><a href="#">Un título de tarjeta</a></div>
      <div id="custom"><x-text>Texto de un componente</x-text></div>`;
    expect(ids(collect())).toEqual(['tweet', 'card', 'custom']);
  });

  it('skips a block already shown in Show both, with its translation beside it or inside it', () => {
    document.body.innerHTML = `
      <p id="done">Ya traducido</p><div data-ega-tx data-ega-tx-state="ok">Already translated</div>
      <ul><li id="item">Elemento traducido<div data-ega-tx data-ega-tx-state="ok">Item</div></li></ul>
      <p id="fresh">Todavía no traducido</p>`;
    expect(ids(collect())).toEqual(['fresh']);
  });

  it('takes a block whose earlier try failed, in either mode', () => {
    document.body.innerHTML = `
      <p id="inplace"><span data-ega-replaced="a" data-ega-tx-state="error">Texto original<span data-ega-tx-error></span></span></p>
      <p id="both">Otro texto aquí</p><div data-ega-tx data-ega-tx-state="error"><span data-ega-tx-error></span></div>`;
    expect(ids(collect())).toEqual(['inplace', 'both']);
  });

  it('skips blocks the viewport band can never reach: closed details, boxes moved off the left edge', () => {
    document.body.innerHTML = `<p id="closed">Respuesta escondida</p><p id="off">Menú fuera de la pantalla</p><p id="on">Texto visible aquí</p>`;
    (document.getElementById('closed') as HTMLElement).checkVisibility = () => false;
    (document.getElementById('off') as HTMLElement).getBoundingClientRect = () =>
      ({ left: -300, right: 0, width: 300, top: 0, bottom: 20, height: 20 }) as DOMRect;
    expect(ids(collect())).toEqual(['on']);
  });
});

describe('blockText — what a block sends', () => {
  it('only the text a reader sees: never code, fields, hidden text or what the page keeps out', () => {
    document.body.innerHTML = `<p id="p">Cuenta del cliente: <span data-ega-skip>IBAN ES91</span> fin<script>track()</script><style>p{}</style> <code>git rebase</code> <span class="notranslate">Marca</span> <span translate="no">Otra</span> <span hidden>oculto</span> <span style="display:none">nada</span> <textarea>borrador</textarea> <span contenteditable="true">escrito</span> <input type="password" value="x"> listo</p>`;
    expect(blockText(document.getElementById('p') as HTMLElement)).toBe(
      'Cuenta del cliente: fin listo',
    );
  });

  it('keeps a line break and collapses runs of spaces', () => {
    document.body.innerHTML = '<p id="p">  Uno\n   dos<br>tres  </p>';
    expect(blockText(document.getElementById('p') as HTMLElement)).toBe('Uno dos\ntres');
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
