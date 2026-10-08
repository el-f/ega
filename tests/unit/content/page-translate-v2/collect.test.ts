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
      <ul><li id="item">Elemento traducido<div data-ega-tx data-ega-inside data-ega-tx-state="ok">Item</div></li></ul>
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

  it('in a list item with two paragraphs, the first one translated does not claim the second', () => {
    document.body.innerHTML = `<ul><li><p id="a">Primer párrafo del punto</p><div data-ega-tx data-ega-tx-state="ok">First</div><p id="b">Segundo párrafo del punto</p></li></ul>`;
    expect(ids(collect())).toEqual(['b']);
  });

  it('skips a box past the right edge, below the page, or cut off by a clipping ancestor', () => {
    document.body.innerHTML = `<div id="track" style="overflow-x:hidden;overflow-y:hidden"><p id="slide">Tercera diapositiva aquí</p></div><p id="right">Más allá del borde</p><p id="below">Por debajo de la página</p><p id="on">Texto visible aquí</p>`;
    const root = document.documentElement;
    for (const [k, v] of Object.entries({
      scrollWidth: 1000,
      clientWidth: 1000,
      scrollHeight: 800,
    }))
      Object.defineProperty(root, k, { configurable: true, value: v });
    const rect = (id: string, r: Partial<DOMRect>): void => {
      (document.getElementById(id) as HTMLElement).getBoundingClientRect = () =>
        ({ width: (r.right ?? 0) - (r.left ?? 0), height: 20, ...r }) as DOMRect;
    };
    rect('track', { left: 0, right: 500, top: 0, bottom: 40 });
    // Inside the page's range, so only the clipping ancestor keeps it out.
    rect('slide', { left: 600, right: 900, top: 0, bottom: 40 });
    rect('right', { left: 1200, right: 1400, top: 50, bottom: 70 });
    rect('below', { left: 0, right: 400, top: 9000, bottom: 9020 });
    rect('on', { left: 0, right: 400, top: 100, bottom: 120 });
    try {
      expect(ids(collect())).toEqual(['on']);
    } finally {
      for (const k of ['scrollWidth', 'clientWidth', 'scrollHeight']) delete (root as never)[k];
    }
  });

  it('takes a block the user reaches by scrolling an inner pane: an app main pane, a wide table', () => {
    // The document itself does not scroll: its range is one screen, and the main pane scrolls instead.
    document.body.innerHTML = `<div id="app" style="overflow-x:hidden;overflow-y:hidden"><main id="main" style="overflow-x:auto;overflow-y:auto"><p id="far">Párrafo al final del panel</p><div id="wide" style="overflow-x:auto;overflow-y:auto"><table><tr><td id="cell">Columna lejana de la tabla</td></tr></table></div><div id="track" style="overflow-x:hidden;overflow-y:hidden"><p id="slide">Tercera diapositiva aquí</p></div></main></div>`;
    const root = document.documentElement;
    for (const [k, v] of Object.entries({
      scrollWidth: 1000,
      clientWidth: 1000,
      scrollHeight: 800,
    }))
      Object.defineProperty(root, k, { configurable: true, value: v });
    const rect = (id: string, r: Partial<DOMRect>): void => {
      (document.getElementById(id) as HTMLElement).getBoundingClientRect = () =>
        ({ width: (r.right ?? 0) - (r.left ?? 0), height: 20, ...r }) as DOMRect;
    };
    rect('app', { left: 0, right: 1000, top: 0, bottom: 800 });
    rect('main', { left: 0, right: 1000, top: 0, bottom: 800 });
    rect('far', { left: 0, right: 400, top: 5000, bottom: 5020 });
    rect('wide', { left: 0, right: 1000, top: 5100, bottom: 5140 });
    rect('cell', { left: 2400, right: 2800, top: 5100, bottom: 5120 });
    // A carousel inside the pane still cuts off its later slides.
    rect('track', { left: 0, right: 500, top: 5200, bottom: 5240 });
    rect('slide', { left: 1000, right: 1500, top: 5200, bottom: 5240 });
    try {
      expect(ids(collect())).toEqual(['far', 'cell']);
    } finally {
      for (const k of ['scrollWidth', 'clientWidth', 'scrollHeight']) delete (root as never)[k];
    }
  });

  it('on a right-to-left page, takes a cell the user can scroll to on the left', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    document.body.innerHTML = `<p id="far" style="direction:rtl">עמודה רחוקה בטבלה</p>`;
    const root = document.documentElement;
    for (const [k, v] of Object.entries({
      scrollWidth: 2000,
      clientWidth: 1000,
      scrollHeight: 800,
    }))
      Object.defineProperty(root, k, { configurable: true, value: v });
    root.style.direction = 'rtl';
    (document.getElementById('far') as HTMLElement).getBoundingClientRect = () =>
      ({ left: -600, right: -200, width: 400, top: 0, bottom: 20, height: 20 }) as DOMRect;
    try {
      expect(ids(collect())).toEqual(['far']);
    } finally {
      for (const k of ['scrollWidth', 'clientWidth', 'scrollHeight']) delete (root as never)[k];
      root.style.removeProperty('direction');
      document.documentElement.removeAttribute('dir');
    }
  });
});

describe('keepsPageParts — what Replace text must not move', () => {
  it('ARIA links and buttons, labels, details and a component with a shadow tree', async () => {
    const { keepsPageParts } = await import('@/content/page-translate-v2/collect');
    const block = (html: string): HTMLElement => {
      document.body.innerHTML = `<p id="b">${html}</p>`;
      return document.getElementById('b') as HTMLElement;
    };
    expect(keepsPageParts(block('Por <span role="link" tabindex="0">usuario</span>'))).toBe(true);
    expect(keepsPageParts(block('Acepta <label for="cb">los términos</label>'))).toBe(true);
    expect(keepsPageParts(block('<span role="button">Ver más</span> texto'))).toBe(true);
    const host = block('Precio <x-price></x-price> al mes');
    host.querySelector('x-price')?.attachShadow({ mode: 'open' });
    expect(keepsPageParts(host)).toBe(true);
    expect(keepsPageParts(block('Solo <em>texto</em> aquí'))).toBe(false);
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

  it('puts a line between block-level children with no whitespace between them, as a React page builds them', () => {
    document.body.innerHTML =
      '<div id="card"><h2>Titular de la noticia</h2><p>El cuerpo de la noticia</p><span>en línea</span></div>';
    expect(blockText(document.getElementById('card') as HTMLElement)).toBe(
      'Titular de la noticia\nEl cuerpo de la noticia\nen línea',
    );
  });

  it('keeps ruby and its reading in the line, as the browser lays them out', () => {
    // Chrome gives ruby and rt their own display values, which are not block-level.
    document.body.innerHTML =
      '<p id="p">これは<ruby style="display:ruby">漢<rt style="display:ruby-text">かん</rt></ruby>字です</p>';
    expect(blockText(document.getElementById('p') as HTMLElement)).toBe('これは漢かん字です');
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
