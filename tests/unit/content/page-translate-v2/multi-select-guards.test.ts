// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enterMultiSelect,
  exitMultiSelect,
  type MultiSelectOpts,
  type SelectedBlock,
} from '@/content/page-translate-v2/multi-select';
import { mountShadowHost } from '@/content/shadowHost';
import { dismissToast } from '@/content/toast';
import { MAX_SELECTION_CHARS } from '@/shared/constants';

function opts(over: Partial<MultiSelectOpts> = {}): MultiSelectOpts {
  return { initialMode: 'inplace', onFire: vi.fn(), ...over };
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function toastText(): string | null {
  const host = document.getElementById('ega-shadow-host');
  const wrap = host?.shadowRoot?.querySelector('[data-ega-toast-wrap]');
  return wrap ? wrap.textContent : null;
}

beforeEach(() => {
  dismissToast();
  document.body.innerHTML = '<p id="a">first paragraph text</p>';
  mountShadowHost();
});

afterEach(() => {
  exitMultiSelect();
  dismissToast();
  document.body.innerHTML = '';
});

describe('multi-select — document-level targets are never pickable', () => {
  it('a click on <body> is refused with a toast and selects nothing', () => {
    enterMultiSelect(opts());
    click(document.body);
    expect(document.body.hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(toastText()).toContain('block inside the page');
  });

  it('a click on <html> is refused, so the shadow host survives', () => {
    enterMultiSelect(opts());
    const host = document.getElementById('ega-shadow-host');
    expect(host).not.toBeNull();
    click(document.documentElement);
    expect(document.documentElement.hasAttribute('data-ega-ms-selected')).toBe(false);
    // The host is a child of <html>: replacing that block in place would detach the toolbar with it.
    expect(host?.isConnected).toBe(true);
  });

  it('firing after a refused document pick translates nothing', () => {
    const onFire = vi.fn();
    enterMultiSelect(opts({ onFire }));
    click(document.body);
    click(document.documentElement);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onFire).not.toHaveBeenCalled();
  });

  it('structural tags are refused', () => {
    document.body.innerHTML =
      '<table id="t"><tbody><tr><td id="cell">ciao mondo</td></tr></tbody></table>';
    enterMultiSelect(opts());
    const table = document.getElementById('t') as Element;
    click(table);
    expect(table.hasAttribute('data-ega-ms-selected')).toBe(false);
    // A cell inside it is still a normal block.
    const cell = document.getElementById('cell') as Element;
    click(cell);
    expect(cell.getAttribute('data-ega-ms-selected')).toBe('1');
  });

  it('the hover cue never marks <body>', () => {
    enterMultiSelect(opts());
    document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(document.body.hasAttribute('data-ega-ms-hover')).toBe(false);
  });
});

describe('multi-select — an over-long block is refused, never truncated', () => {
  it('refuses a block past the request cap and says how long it is', () => {
    const long = 'x'.repeat(MAX_SELECTION_CHARS + 50);
    document.body.innerHTML = `<p id="big">${long}</p>`;
    enterMultiSelect(opts());
    const big = document.getElementById('big') as Element;
    click(big);
    expect(big.hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(toastText()).toContain('too long');
  });

  it('a block that grows past the cap after picking is skipped instead of cut', () => {
    document.body.innerHTML = '<p id="grow">short enough</p><p id="ok">also fine</p>';
    let fired: SelectedBlock[] | null = null;
    enterMultiSelect(
      opts({
        onFire: (blocks) => {
          fired = blocks;
        },
      }),
    );
    const grow = document.getElementById('grow') as HTMLElement;
    click(grow);
    click(document.getElementById('ok') as Element);
    grow.textContent = 'y'.repeat(MAX_SELECTION_CHARS + 1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    const blocks = fired as SelectedBlock[] | null;
    expect(blocks?.map((b) => b.element.id)).toEqual(['ok']);
    expect(toastText()).toContain('Skipped 1 area');
  });

  it('a block exactly at the cap is still allowed', () => {
    document.body.innerHTML = `<p id="edge">${'z'.repeat(MAX_SELECTION_CHARS)}</p>`;
    enterMultiSelect(opts());
    const edge = document.getElementById('edge') as Element;
    click(edge);
    expect(edge.getAttribute('data-ega-ms-selected')).toBe('1');
  });
});

describe('multi-select — an already-translated block is refused', () => {
  it('refuses a block carrying an in-place wrapper', () => {
    document.body.innerHTML = '<p id="done"><span data-ega-replaced="b-1">translated</span></p>';
    enterMultiSelect(opts());
    const done = document.getElementById('done') as Element;
    click(done);
    expect(done.hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(toastText()).toContain('already translated');
  });

  it('refuses a source block that already has a bilingual translation next to it', () => {
    document.body.innerHTML = '<p id="src">ciao mondo</p><div data-ega-tx>hello world</div>';
    enterMultiSelect(opts());
    const src = document.getElementById('src') as Element;
    click(src);
    expect(src.hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(toastText()).toContain('already translated');
  });

  it('refuses a bilingual insert and anything inside one', () => {
    document.body.innerHTML = '<div data-ega-tx id="tx"><em id="inner">translated</em></div>';
    enterMultiSelect(opts());
    click(document.getElementById('inner') as Element);
    expect(document.getElementById('inner')?.hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(document.getElementById('tx')?.hasAttribute('data-ega-ms-selected')).toBe(false);
  });
});
