// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectBlocks } from '@/content/page-translate-v2/collect';

function box(id: string, left: number, top: number, width = 300, height = 40): void {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing ${id}`);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
  } as DOMRect);
}

function collected(): string[] {
  return collectBlocks(document.body, { maxChars: 2000 }).map((el) => el.id);
}

beforeEach(() => {
  for (const [key, value] of Object.entries({
    clientWidth: 1000,
    scrollWidth: 1600,
    clientHeight: 800,
    scrollHeight: 5000,
  })) {
    Object.defineProperty(document.documentElement, key, { configurable: true, value });
  }
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const key of ['clientWidth', 'scrollWidth', 'clientHeight', 'scrollHeight']) {
    Reflect.deleteProperty(document.documentElement, key);
  }
  document.documentElement.style.cssText = '';
  document.body.style.cssText = '';
});

describe('the scroller must itself be reachable', () => {
  it('leaves out a closed fixed drawer even when both its axes scroll', () => {
    document.body.innerHTML =
      '<aside id="drawer" style="overflow-x:auto;overflow-y:auto"><p id="closed">Texto del menú cerrado</p></aside><p id="visible">Texto visible</p>';
    box('drawer', -300, 0);
    box('closed', -290, 10, 280);
    box('visible', 0, 100);
    expect(collected()).toEqual(['visible']);
  });

  it('does not let a scrolling slide escape the carousel that clips it', () => {
    document.body.innerHTML =
      '<div id="carousel" style="overflow-x:hidden;overflow-y:hidden"><div id="slide" style="overflow-x:auto;overflow-y:auto"><p id="closed">Otra diapositiva</p></div></div><p id="visible">Texto visible</p>';
    box('carousel', 0, 0, 500);
    box('slide', 600, 0);
    box('closed', 610, 10, 280);
    box('visible', 0, 100);
    expect(collected()).toEqual(['visible']);
  });

  it('uses the viewport width when body hides horizontal overflow', () => {
    document.body.style.overflowX = 'hidden';
    document.body.innerHTML =
      '<aside id="drawer" style="overflow-x:auto;overflow-y:auto"><p id="closed">Texto del menú cerrado</p></aside><p id="visible">Texto visible</p>';
    box('drawer', 1100, 0);
    box('closed', 1110, 10, 280);
    box('visible', 0, 100);
    expect(collected()).toEqual(['visible']);
  });

  it('leaves out text before an inner scroller start, while keeping text at its far end', () => {
    document.body.innerHTML =
      '<main id="pane" style="overflow-x:auto;overflow-y:auto"><p id="before">Antes del comienzo</p><p id="far">Final del panel</p></main>';
    box('pane', 0, 0, 1000, 800);
    box('before', -300, 10);
    box('far', 0, 4000);
    expect(collected()).toEqual(['far']);
  });

  it('uses the right start edge for a right-to-left inner scroller', () => {
    document.body.innerHTML =
      '<main id="pane" style="direction:rtl;overflow-x:auto;overflow-y:auto"><p id="before">לפני תחילת האזור</p><p id="far">בסוף האזור</p></main>';
    box('pane', 0, 0, 1000, 800);
    box('before', 1100, 10);
    box('far', -600, 10);
    expect(collected()).toEqual(['far']);
  });

  it('keeps text before the visible edge when it is reached by scrolling back', () => {
    document.body.innerHTML =
      '<main id="pane" style="overflow-x:auto;overflow-y:auto"><p id="back">Texto anterior</p><p id="far">Final del panel</p></main>';
    const pane = document.getElementById('pane') as HTMLElement;
    pane.scrollLeft = 500;
    pane.scrollTop = 2000;
    box('pane', 0, 0, 1000, 800);
    box('back', -400, -1000);
    box('far', 0, 2000);
    expect(collected()).toEqual(['back', 'far']);
  });
});
