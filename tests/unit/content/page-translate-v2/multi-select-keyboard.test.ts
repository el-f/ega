// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enterMultiSelect,
  exitMultiSelect,
  isMultiSelectActive,
  type MultiSelectOpts,
  type SelectedBlock,
} from '@/content/page-translate-v2/multi-select';
import { flushSync } from 'svelte';
import { mountShadowHost } from '@/content/shadowHost';
import { dismissToast } from '@/content/toast';

function opts(over: Partial<MultiSelectOpts> = {}): MultiSelectOpts {
  return { initialMode: 'inplace', onFire: vi.fn(), ...over };
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(e);
  return e;
}

function el(id: string): Element {
  const node = document.getElementById(id);
  if (!node) throw new Error(`test setup: #${id}`);
  return node;
}

function cursor(): Element | null {
  return document.querySelector('[data-ega-ms-cursor]');
}

function live(): string | null {
  const host = document.getElementById('ega-shadow-host');
  return host?.shadowRoot?.querySelector('[data-ega-ms-live]')?.textContent ?? null;
}

beforeEach(() => {
  dismissToast();
  document.body.innerHTML = `
    <main id="main">
      <p id="first">first para</p>
      <section id="mid"><p id="nested">nested text</p></section>
      <input id="pw" type="password" />
      <p id="last">last para</p>
    </main>
  `;
  mountShadowHost();
});

afterEach(() => {
  exitMultiSelect();
  dismissToast();
  document.body.innerHTML = '';
});

describe('multi-select keyboard path', () => {
  it('paints no cursor until the first navigation key', () => {
    enterMultiSelect(opts());
    expect(cursor()).toBeNull();
  });

  it('the first arrow key puts the cursor on the top block, never on <body>', () => {
    enterMultiSelect(opts());
    press('ArrowDown');
    expect(cursor()).toBe(el('main'));
  });

  it('ArrowDown descends, ArrowUp climbs back and stops below <body>', () => {
    enterMultiSelect(opts());
    press('ArrowDown');
    press('ArrowDown');
    expect(cursor()).toBe(el('first'));
    press('ArrowUp');
    expect(cursor()).toBe(el('main'));
    press('ArrowUp');
    press('ArrowUp');
    expect(cursor()).toBe(el('main'));
  });

  it('Tab walks siblings forward, Shift+Tab back, skipping a password field', () => {
    enterMultiSelect(opts());
    press('ArrowDown');
    press('ArrowDown');
    expect(cursor()).toBe(el('first'));
    press('Tab');
    expect(cursor()).toBe(el('mid'));
    press('Tab');
    expect(cursor()).toBe(el('last'));
    press('Tab', { shiftKey: true });
    expect(cursor()).toBe(el('mid'));
  });

  it('Space toggles the block under the cursor and announces the new count', () => {
    enterMultiSelect(opts());
    press('ArrowDown');
    press('ArrowDown');
    press(' ');
    expect(el('first').getAttribute('data-ega-ms-selected')).toBe('1');
    expect(live()).toContain('1 area chosen');

    press(' ');
    expect(el('first').hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(live()).toContain('Click blocks to choose them');
  });

  it('moving the cursor announces the block text', () => {
    enterMultiSelect(opts());
    press('ArrowDown');
    press('ArrowDown');
    expect(live()).toContain('first para');
  });

  it('Space on a refused block announces the reason instead of selecting it', () => {
    document.body.innerHTML = '<div id="wrap"><p id="done"><span data-ega-tx>x</span></p></div>';
    enterMultiSelect(opts());
    press('ArrowDown');
    press('ArrowDown');
    expect(cursor()).toBe(el('done'));
    press(' ');
    expect(el('done').hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(live()).toContain('already translated');
  });

  it('Enter fires the keyboard selection and exits the mode', () => {
    let fired: SelectedBlock[] | null = null;
    enterMultiSelect(
      opts({
        onFire: (blocks) => {
          fired = blocks;
        },
      }),
    );
    press('ArrowDown');
    press('ArrowDown');
    press(' ');
    press('Enter');
    const blocks = fired as SelectedBlock[] | null;
    expect(blocks?.map((b) => b.element.id)).toEqual(['first']);
    expect(isMultiSelectActive()).toBe(false);
  });

  it('Escape exits and clears the cursor marker', () => {
    enterMultiSelect(opts());
    press('ArrowDown');
    expect(cursor()).not.toBeNull();
    press('Escape');
    expect(isMultiSelectActive()).toBe(false);
    expect(cursor()).toBeNull();
  });

  it('keeps the browser from acting on the keys it handles', () => {
    enterMultiSelect(opts());
    expect(press('Tab').defaultPrevented).toBe(true);
    press('ArrowDown');
    expect(press(' ').defaultPrevented).toBe(true);
  });

  it('ignores keys after exit', () => {
    enterMultiSelect(opts());
    exitMultiSelect();
    press('ArrowDown');
    expect(cursor()).toBeNull();
  });
});

function toolbar(sel: string): HTMLElement {
  const host = document.getElementById('ega-shadow-host');
  const el = host?.shadowRoot?.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`test setup: ${sel}`);
  return el;
}

/** Real key events cross the shadow boundary; the document handler sees the host as the target. */
function pressIn(el: HTMLElement, key: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  el.dispatchEvent(e);
  return e;
}

describe('multi-select — the toolbar is reachable from the keyboard', () => {
  it('M switches how the translation shows, and says which mode is now on', () => {
    const onModeChange = vi.fn();
    enterMultiSelect(opts({ onModeChange }));

    press('m');

    expect(onModeChange).toHaveBeenCalledWith('bilingual');
    expect(toolbar('[data-ega-ms-mode="bilingual"]').getAttribute('aria-checked')).toBe('true');
    expect(toolbar('[data-ega-ms-mode="inplace"]').getAttribute('aria-checked')).toBe('false');
    expect(live()).toBe(toolbar('[data-ega-ms-mode="bilingual"]').textContent.trim());
  });

  it('M switches back, so one key covers both modes', () => {
    const onModeChange = vi.fn();
    enterMultiSelect(opts({ onModeChange }));
    press('m');
    press('M');
    expect(onModeChange).toHaveBeenLastCalledWith('inplace');
    expect(toolbar('[data-ega-ms-mode="inplace"]').getAttribute('aria-checked')).toBe('true');
  });

  it('leaves Cmd+M and Ctrl+M to the browser', () => {
    const onModeChange = vi.fn();
    enterMultiSelect(opts({ onModeChange }));

    expect(press('m', { metaKey: true }).defaultPrevented).toBe(false);
    expect(press('m', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('leaves Space and Enter to the toolbar once focus is on one of its buttons', () => {
    enterMultiSelect(opts());
    const btn = toolbar('[data-ega-ms-mode="bilingual"]');

    expect(pressIn(btn, ' ').defaultPrevented).toBe(false);
    expect(pressIn(btn, 'Enter').defaultPrevented).toBe(false);
    expect(cursor()).toBeNull();
  });

  it('? moves focus to Keys, which shows the key list, from anywhere on the page', () => {
    enterMultiSelect(opts());
    expect(press('?').defaultPrevented).toBe(true);
    const keys = toolbar('[data-ega-picker-keys]');
    expect(keys.getRootNode()).toBeInstanceOf(ShadowRoot);
    expect((keys.getRootNode() as ShadowRoot).activeElement).toBe(keys);
    expect(toolbar('[role="tooltip"]').hidden).toBe(false);
  });

  it('Tab from the toolbar goes back to the blocks it walks', () => {
    enterMultiSelect(opts());
    press('?');
    const keys = toolbar('[data-ega-picker-keys]');
    expect(pressIn(keys, 'Tab').defaultPrevented).toBe(true);
    expect((keys.getRootNode() as ShadowRoot).activeElement).toBeNull();
    expect(cursor()).toBe(el('main'));
  });

  it('M switches the mode with focus in the toolbar too', () => {
    const onModeChange = vi.fn();
    enterMultiSelect(opts({ onModeChange }));
    press('?');
    pressIn(toolbar('[data-ega-picker-keys]'), 'm');
    expect(onModeChange).toHaveBeenCalledWith('bilingual');
  });

  it('Esc with the key list open closes only the list; the next Esc leaves the mode', () => {
    enterMultiSelect(opts());
    press('ArrowDown');
    press('ArrowDown');
    press(' ');
    const keys = toolbar('[data-ega-picker-keys]');
    keys.click();
    flushSync();
    expect(toolbar('[role="tooltip"]').hidden).toBe(false);

    pressIn(keys, 'Escape');
    flushSync();
    expect(toolbar('[role="tooltip"]').hidden).toBe(true);
    expect(isMultiSelectActive()).toBe(true);
    expect(el('first').getAttribute('data-ega-ms-selected')).toBe('1');

    pressIn(keys, 'Escape');
    expect(isMultiSelectActive()).toBe(false);
  });

  it('still exits on Escape while focus is in the toolbar', () => {
    enterMultiSelect(opts());
    pressIn(toolbar('[data-ega-ms-exit]'), 'Escape');
    expect(isMultiSelectActive()).toBe(false);
  });

  it('names every key it answers in the Keys toggletip', () => {
    enterMultiSelect(opts());
    const hint = toolbar('[role="tooltip"]').textContent;
    for (const key of ['↑', '↓', 'Tab', 'Space', 'M', 'Enter', 'Esc', '?']) {
      expect(hint).toContain(key);
    }
  });

  it('says once, when the mode starts, which key reaches the toolbar', async () => {
    enterMultiSelect(opts());
    await vi.waitFor(() =>
      expect(live()).toBe('Press the question mark key for the bar and its keys.'),
    );
  });
});

describe('multi-select — where the keyboard starts', () => {
  function box(id: string, top: number): void {
    el(id).getBoundingClientRect = () =>
      ({ top, bottom: top + 20, height: 20, left: 0, right: 100, width: 100 }) as DOMRect;
  }

  it('the first navigation key goes to the first block in view, not the top of the page', () => {
    box('first', -400);
    box('nested', -200);
    box('last', 120);
    enterMultiSelect(opts());
    press('ArrowDown');
    expect(cursor()).toBe(el('last'));
  });

  it('Space chooses the block the pointer outlines', () => {
    enterMultiSelect(opts());
    el('nested').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(press(' ').defaultPrevented).toBe(true);
    expect(el('nested').getAttribute('data-ega-ms-selected')).toBe('1');
  });

  it('the keyboard walks on from the block the pointer outlines', () => {
    enterMultiSelect(opts());
    el('first').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    press('Tab');
    expect(cursor()).toBe(el('mid'));
  });

  it('? on an Arabic or Persian layout (U+061F) reaches the toolbar too', () => {
    enterMultiSelect(opts());
    expect(press('؟').defaultPrevented).toBe(true);
    const keys = toolbar('[data-ega-picker-keys]');
    expect((keys.getRootNode() as ShadowRoot).activeElement).toBe(keys);
  });
});

function click(target: Element): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('multi-select — a failed area can be chosen again', () => {
  it('a click on a failed Replace-text block chooses the block, not its wrapper', () => {
    document.body.innerHTML =
      '<p id="f"><span id="w" data-ega-replaced="b1" data-ega-tx-state="error">la casa roja</span></p>';
    enterMultiSelect(opts());
    click(el('w'));
    expect(el('f').getAttribute('data-ega-ms-selected')).toBe('1');
    expect(el('w').hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(toolbar('[data-ega-ms-count]').textContent).toBe('1 area chosen');
  });

  it('a failed Show-both box leaves its original choosable, from the original or the box', () => {
    document.body.innerHTML =
      '<p id="o">la casa roja</p><div id="x" data-ega-tx data-ega-tx-state="error">error</div>';
    enterMultiSelect(opts());
    click(el('x'));
    expect(el('o').getAttribute('data-ega-ms-selected')).toBe('1');
    click(el('o'));
    expect(el('o').hasAttribute('data-ega-ms-selected')).toBe(false);
    click(el('o'));
    expect(el('o').getAttribute('data-ega-ms-selected')).toBe('1');
  });

  it('a failed Show-both box inside a list item chooses the item', () => {
    document.body.innerHTML =
      '<ul><li id="i">la casa roja<div id="x" data-ega-tx data-ega-tx-state="error">error</div></li></ul>';
    enterMultiSelect(opts());
    click(el('x'));
    expect(el('i').getAttribute('data-ega-ms-selected')).toBe('1');
  });

  it('a translated area is still refused', () => {
    document.body.innerHTML =
      '<p id="t"><span id="w" data-ega-replaced="b1" data-ega-tx-state="ok">the red house</span></p>' +
      '<p id="o">la casa roja</p><div data-ega-tx data-ega-tx-state="ok">the red house</div>';
    enterMultiSelect(opts());
    click(el('t'));
    expect(el('t').hasAttribute('data-ega-ms-selected')).toBe(false);
    expect(toolbar('[data-ega-ms-count]').textContent).toBe('That area is already translated.');
    click(el('o'));
    expect(el('o').hasAttribute('data-ega-ms-selected')).toBe(false);
  });
});
