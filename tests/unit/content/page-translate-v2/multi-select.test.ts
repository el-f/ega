// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enterMultiSelect,
  exitMultiSelect,
  isMultiSelectActive,
  type MultiSelectOpts,
  type SelectedBlock,
} from '@/content/page-translate-v2/multi-select';

function opts(over: Partial<MultiSelectOpts> = {}): MultiSelectOpts {
  return { initialMode: 'inplace', onFire: vi.fn(), ...over };
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function toolbar(): HTMLElement | null {
  const host = document.getElementById('ega-shadow-host');
  return host?.shadowRoot?.querySelector<HTMLElement>('[data-ega-picker-bar="areas"]') ?? null;
}

function toolbarEl<T extends HTMLElement>(sel: string): T | null {
  const host = document.getElementById('ega-shadow-host');
  return host?.shadowRoot?.querySelector<T>(sel) ?? null;
}

beforeEach(() => {
  document.body.innerHTML =
    '<p id="a">first paragraph text</p>' +
    '<div id="wrap"><p id="b">second paragraph text</p></div>' +
    '<p id="empty">   </p>' +
    '<input id="pw" type="password" />';
});

afterEach(() => {
  exitMultiSelect();
  document.body.innerHTML = '';
});

describe('multi-select — enter / exit', () => {
  it('enter mounts the toolbar; exit removes it and every marker attribute', () => {
    enterMultiSelect(opts());
    expect(isMultiSelectActive()).toBe(true);
    expect(toolbar()).not.toBeNull();

    click(document.getElementById('a') as Element);
    expect(document.getElementById('a')?.getAttribute('data-ega-ms-selected')).toBe('1');

    exitMultiSelect();
    expect(isMultiSelectActive()).toBe(false);
    expect(toolbar()).toBeNull();
    expect(document.querySelector('[data-ega-ms-selected]')).toBeNull();
    expect(document.querySelector('[data-ega-ms-hover]')).toBeNull();
  });

  it('a second enter while active is a no-op', () => {
    const onFire = vi.fn();
    enterMultiSelect(opts({ onFire }));
    enterMultiSelect(opts());
    click(document.getElementById('a') as Element);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    // The first session's onFire wins — no stacked sessions.
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('Escape exits without firing', () => {
    const onFire = vi.fn();
    enterMultiSelect(opts({ onFire }));
    click(document.getElementById('a') as Element);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(isMultiSelectActive()).toBe(false);
    expect(onFire).not.toHaveBeenCalled();
  });
});

describe('multi-select — selection behavior', () => {
  it('click selects with a 1-based order badge; clicking again unselects and renumbers', () => {
    enterMultiSelect(opts());
    const a = document.getElementById('a') as Element;
    const b = document.getElementById('b') as Element;
    click(a);
    click(b);
    expect(a.getAttribute('data-ega-ms-selected')).toBe('1');
    expect(b.getAttribute('data-ega-ms-selected')).toBe('2');

    click(a);
    expect(a.hasAttribute('data-ega-ms-selected')).toBe(false);
    // The remaining selection renumbers from 1.
    expect(b.getAttribute('data-ega-ms-selected')).toBe('1');
  });

  it('a click inside a selected area unselects that area', () => {
    enterMultiSelect(opts());
    const wrap = document.getElementById('wrap') as Element;
    const b = document.getElementById('b') as Element;
    click(wrap);
    expect(wrap.hasAttribute('data-ega-ms-selected')).toBe(true);
    click(b);
    expect(wrap.hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(b.hasAttribute('data-ega-ms-selected')).toBe(false);
  });

  it('selecting a parent swallows its selected children', () => {
    enterMultiSelect(opts());
    const wrap = document.getElementById('wrap') as Element;
    const b = document.getElementById('b') as Element;
    click(b);
    expect(b.getAttribute('data-ega-ms-selected')).toBe('1');
    click(wrap);
    expect(b.hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(wrap.getAttribute('data-ega-ms-selected')).toBe('1');
  });

  it('an empty element is refused in the bar, not a toast, and never selected', () => {
    enterMultiSelect(opts());
    const empty = document.getElementById('empty') as Element;
    click(empty);
    expect(empty.hasAttribute('data-ega-ms-selected')).toBe(false);
    const root = document.getElementById('ega-shadow-host')?.shadowRoot;
    expect(root?.querySelector('[data-ega-ms-count]')?.textContent).toBe(
      'Nothing to translate in that element.',
    );
    expect(root?.querySelector('[data-ega-toast-wrap]')).toBeNull();
  });

  it('a sensitive target is rejected and the mode stays on', () => {
    enterMultiSelect(opts());
    click(document.getElementById('pw') as Element);
    expect(document.getElementById('pw')?.hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(isMultiSelectActive()).toBe(true);
  });

  it('hover marks the element under the cursor and clears on move-away', () => {
    enterMultiSelect(opts());
    const a = document.getElementById('a') as Element;
    const b = document.getElementById('b') as Element;
    a.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(a.hasAttribute('data-ega-ms-hover')).toBe(true);
    b.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(a.hasAttribute('data-ega-ms-hover')).toBe(false);
    expect(b.hasAttribute('data-ega-ms-hover')).toBe(true);
  });

  it('marks the block under the pointer at once, before any mouse move', () => {
    const b = document.getElementById('b') as Element;
    const real = document.querySelectorAll.bind(document);
    // jsdom keeps no hover state; the browser's is the chain from <html> down to the element under the pointer.
    const spy = vi
      .spyOn(document, 'querySelectorAll')
      .mockImplementation(((sel: string) =>
        sel === ':hover'
          ? [document.documentElement, document.body, b.parentElement, b]
          : real(sel)) as typeof document.querySelectorAll);
    try {
      enterMultiSelect(opts());
      expect(b.hasAttribute('data-ega-ms-hover')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('multi-select — toolbar', () => {
  it('shows the count and lets Translate run only when something is chosen', () => {
    enterMultiSelect(opts());
    const btn = toolbarEl<HTMLButtonElement>('[data-ega-ms-translate]');
    const count = toolbarEl<HTMLElement>('[data-ega-ms-count]');
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
    click(document.getElementById('a') as Element);
    expect(btn?.hasAttribute('aria-disabled')).toBe(false);
    expect(btn?.textContent.trim()).toBe('Translate');
    expect(count?.textContent).toBe('1 area chosen');
    click(document.getElementById('b') as Element);
    expect(count?.textContent).toBe('2 areas chosen');
  });

  it('the mode radios report the change and update aria-checked', () => {
    const onModeChange = vi.fn();
    enterMultiSelect(opts({ onModeChange }));
    const bilingualBtn = toolbarEl<HTMLButtonElement>('[data-ega-ms-mode="bilingual"]');
    const inplaceBtn = toolbarEl<HTMLButtonElement>('[data-ega-ms-mode="inplace"]');
    expect(inplaceBtn?.getAttribute('aria-checked')).toBe('true');
    bilingualBtn?.click();
    expect(onModeChange).toHaveBeenCalledWith('bilingual');
    expect(bilingualBtn?.getAttribute('aria-checked')).toBe('true');
    expect(inplaceBtn?.getAttribute('aria-checked')).toBe('false');
  });

  it('the Translate button fires the selection in click order with the current mode', () => {
    let fired: { blocks: SelectedBlock[]; mode: string } | null = null;
    enterMultiSelect(
      opts({
        onFire: (blocks, mode) => {
          fired = { blocks, mode };
        },
      }),
    );
    const b = document.getElementById('b') as Element;
    const a = document.getElementById('a') as Element;
    click(b);
    click(a);
    toolbarEl<HTMLButtonElement>('[data-ega-ms-mode="bilingual"]')?.click();
    toolbarEl<HTMLButtonElement>('[data-ega-ms-translate]')?.click();

    expect(isMultiSelectActive()).toBe(false);
    const got = fired as { blocks: SelectedBlock[]; mode: string } | null;
    expect(got).not.toBeNull();
    expect(got?.mode).toBe('bilingual');
    expect(got?.blocks.map((x) => x.element.id)).toEqual(['b', 'a']);
    expect(got?.blocks[0]?.text).toBe('second paragraph text');
    expect(got?.blocks.every((x) => x.id.startsWith('b-'))).toBe(true);
    // Marker attributes are gone before the renderer mounts anything.
    expect(document.querySelector('[data-ega-ms-selected]')).toBeNull();
  });

  it('Enter with nothing selected does not fire', () => {
    const onFire = vi.fn();
    enterMultiSelect(opts({ onFire }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onFire).not.toHaveBeenCalled();
    expect(isMultiSelectActive()).toBe(true);
  });
});
