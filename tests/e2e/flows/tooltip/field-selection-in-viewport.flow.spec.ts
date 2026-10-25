/* coverage: translation.tooltip.field-selection-in-viewport */
import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';

// GitHub's file view selects code through a transparent textarea over it; the page Selection stays collapsed.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
    bubbleMode: 'always',
  });
  mockAnthropic(ext.context, {
    translation: 'Hello my friend, how are you? What are you doing?',
    confidence: 0.9,
  });
});

test.afterEach(async () => {
  await ext.close();
});

interface Box {
  top: number;
  bottom: number;
}

/** The file view scrolled so the file ends 40px above the viewport bottom, its top above the viewport. */
async function openScrolledCodeView(page: Page, height = 800): Promise<void> {
  await page.setViewportSize({ width: 1280, height });
  await page.goto(`${ext.serverUrl}/code-view-page.html`);
  await waitForTestHooks(page);
  await page.locator('#read-only-cursor-text-area').waitFor();
  const field = await page.evaluate(() => {
    const ta = document.getElementById('read-only-cursor-text-area');
    if (!ta) throw new Error('no textarea');
    window.scrollBy(0, ta.getBoundingClientRect().bottom - (window.innerHeight - 40));
    const r = ta.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, innerHeight: window.innerHeight };
  });
  expect(field.top).toBeLessThan(0);
  expect(field.bottom).toBeCloseTo(field.innerHeight - 40, 0);
}

/** A real mouse drag over the file's last Arabizi lines, 33 to 36; returns the lines' box. */
async function dragLastArabiziLines(page: Page): Promise<Box> {
  const first = await page.locator('#LC33').boundingBox();
  const last = await page.locator('#LC36').boundingBox();
  if (!first || !last) throw new Error('code lines missing');
  await page.mouse.move(first.x + 93, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 4, last.y + last.height / 2, { steps: 8 });
  await page.mouse.up();
  const selected = await page.evaluate(() => {
    const ta = document.activeElement;
    return ta instanceof HTMLTextAreaElement
      ? ta.value.slice(ta.selectionStart, ta.selectionEnd)
      : '';
  });
  expect(selected).toContain('mar7aba habibi');
  expect(selected).toContain('kif 7alak');
  return { top: first.y, bottom: last.y + last.height };
}

async function linesBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const a = document.getElementById('LC33')?.getBoundingClientRect();
    const b = document.getElementById('LC36')?.getBoundingClientRect();
    return { top: a?.top ?? NaN, bottom: b?.bottom ?? NaN };
  });
}

interface CardRows {
  card: { top: number; bottom: number; height: number };
  rows: { name: string; top: number; bottom: number }[];
  innerHeight: number;
}

/** The settled card and each of its fixed rows, read in one tick; null until every row has rendered. */
async function cardRows(page: Page): Promise<CardRows | null> {
  return page.evaluate(() => {
    const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
    const tip = root?.querySelector<HTMLElement>('.tooltip');
    if (!root || !tip) return null;
    const box = tip.getBoundingClientRect();
    const rows = ['.tooltip-topbar', '.body', '.ega-reply-meta', '.actions'].map((sel) => {
      const r = root.querySelector(`.tooltip ${sel}`)?.getBoundingClientRect();
      return { name: sel, top: r?.top ?? NaN, bottom: r?.bottom ?? NaN };
    });
    // The answer renders after the card opens: a missing row means the card is not settled yet.
    if (rows.some((row) => Number.isNaN(row.top))) return null;
    return {
      card: { top: box.top, bottom: box.bottom, height: box.height },
      rows,
      innerHeight: window.innerHeight,
    };
  });
}

function expectInside(g: CardRows): void {
  expect(g.card.top).toBeGreaterThanOrEqual(0);
  expect(g.card.bottom).toBeLessThanOrEqual(g.innerHeight);
  for (const row of g.rows) {
    expect(row.top, row.name).toBeGreaterThanOrEqual(g.card.top - 1);
    expect(row.bottom, row.name).toBeLessThanOrEqual(g.card.bottom + 1);
  }
}

/** Vertical distance from the card to the lines; negative when they overlap. */
function gapBetween(card: { top: number; bottom: number }, lines: Box): number {
  return card.bottom <= lines.top ? lines.top - card.bottom : card.top - lines.bottom;
}

/** The open card is whole, inside the viewport, next to the lines and not over them, and it follows a page scroll. */
async function expectBesideLinesAndFollow(page: Page): Promise<void> {
  await expect.poll(async () => (await cardRows(page)) !== null, { timeout: 10_000 }).toBe(true);
  const g = await cardRows(page);
  if (!g) throw new Error('no tooltip');
  expectInside(g);
  const lines = await linesBox(page);
  // Above or below the dragged lines, never over them, and next to them.
  expect(g.card.bottom <= lines.top || g.card.top >= lines.bottom).toBe(true);
  expect(gapBetween(g.card, lines)).toBeLessThanOrEqual(40);

  await page.mouse.wheel(0, 100);
  await expect
    .poll(
      async () => {
        const after = await cardRows(page);
        const moved = await linesBox(page);
        if (!after || moved.top > lines.top - 50) return false;
        // Within 40px of the scrolled lines. The side may change: below wins once the card fits there.
        const gap = gapBetween(after.card, moved);
        return gap >= 0 && gap <= 40;
      },
      { timeout: 3_000 },
    )
    .toBe(true);
  const after = await cardRows(page);
  const moved = await linesBox(page);
  if (!after) throw new Error('tooltip gone after scroll');
  expect(moved.top).toBeLessThan(lines.top - 50);
  expectInside(after);
  expect(after.card.bottom <= moved.top || after.card.top >= moved.bottom).toBe(true);
}

// At 500px the file's textarea (about 766px) is taller than the window, as in the owner's report.
for (const height of [800, 500]) {
  test(`a code-view selection near the bottom of a ${height}px window opens the tooltip beside the selected lines`, async () => {
    const page = await ext.context.newPage();
    await openScrolledCodeView(page, height);
    await dragLastArabiziLines(page);
    await page.keyboard.press('Control+Shift+L');
    await expectBesideLinesAndFollow(page);
  });

  test(`the bubble click on a code-view selection in a ${height}px window opens the tooltip beside the selected lines`, async () => {
    const page = await ext.context.newPage();
    await openScrolledCodeView(page, height);
    await dragLastArabiziLines(page);
    // The normal path: a real click on the bubble, not the shortcut.
    await expect
      .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
      .toBeGreaterThan(0);
    await page.locator('#ega-shadow-host [data-ega-bubble-wrap] button.bubble').click();
    await expectBesideLinesAndFollow(page);
  });
}

/** The body's box and scroll height, and the card's min-content: every fixed row at its smallest, plus padding and border. */
async function cardSizes(
  page: Page,
): Promise<{ bodyHeight: number; bodyScroll: number; minContent: number; innerHeight: number }> {
  return page.evaluate(() => {
    const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
    const tip = root?.querySelector<HTMLElement>('.tooltip');
    const reply = root?.querySelector<HTMLElement>('.tooltip .tooltip-reply');
    const body = root?.querySelector<HTMLElement>('.tooltip .body');
    if (!tip || !reply || !body) throw new Error('no settled card');
    const bodyHeight = body.getBoundingClientRect().height;
    const bodyScroll = body.scrollHeight - body.clientHeight;
    const prev = reply.style.getPropertyValue('--ega-tooltip-max-block-size');
    reply.style.setProperty('--ega-tooltip-max-block-size', '0px');
    const cs = getComputedStyle(tip);
    const chrome = ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']
      .map((prop) => Number.parseFloat(cs.getPropertyValue(prop)) || 0)
      .reduce((a, b) => a + b, 0);
    const top = root?.querySelector('.tooltip .tooltip-topbar')?.getBoundingClientRect().top ?? NaN;
    const bottom = root?.querySelector('.tooltip .actions')?.getBoundingClientRect().bottom ?? NaN;
    reply.style.setProperty('--ega-tooltip-max-block-size', prev);
    return {
      bodyHeight,
      bodyScroll,
      minContent: bottom - top + chrome,
      innerHeight: window.innerHeight,
    };
  });
}

/** Ctrl+A in the field and the shortcut: the selection is taller than the room on both sides. */
async function translateWholeField(page: Page): Promise<CardRows> {
  await openScrolledCodeView(page);
  await page.locator('#read-only-cursor-text-area').click({ position: { x: 100, y: 40 } });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+Shift+L');
  await expect.poll(async () => (await cardRows(page)) !== null, { timeout: 10_000 }).toBe(true);
  const g = await cardRows(page);
  if (!g) throw new Error('no tooltip');
  return g;
}

test('a code-view selection taller than the room on both sides opens the whole card inside the viewport, over the selection', async () => {
  const page = await ext.context.newPage();
  const g = await translateWholeField(page);
  expectInside(g);
  const sizes = await cardSizes(page);
  // A short answer shows whole: the body does not scroll.
  expect(sizes.bodyScroll).toBeLessThanOrEqual(1);
  // MIN_TOOLTIP_BLOCK in src/content/tipState.svelte.ts is the card's min-content, so it must hold every fixed row.
  expect(sizes.minContent).toBeLessThanOrEqual(200);
});

test('a long answer to that selection gets room up to the window height, not a short scrolling box', async () => {
  mockAnthropic(ext.context, {
    translation: Array.from({ length: 40 }, (_, i) => `<p>Line ${i}: hello my friend</p>`).join(
      '\n',
    ),
    confidence: 0.9,
  });
  const page = await ext.context.newPage();
  const g = await translateWholeField(page);
  expectInside(g);
  const sizes = await cardSizes(page);
  // A card that covers the selection lifts the body's 40vh cap: the answer fills the card, up to the window.
  expect(sizes.bodyHeight).toBeGreaterThan(0.55 * sizes.innerHeight);
  expect(g.card.height).toBeGreaterThan(0.8 * sizes.innerHeight);
});

test('the selection bubble sits next to the selected code lines, inside the viewport', async () => {
  const page = await ext.context.newPage();
  await openScrolledCodeView(page);
  const lines = await dragLastArabiziLines(page);

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const b = await egaTest<{ top: number; bottom: number; innerHeight: number }>(page, 'bubbleRect');
  if (!b) throw new Error('no bubble');
  expect(b.top).toBeGreaterThanOrEqual(0);
  expect(b.bottom).toBeLessThanOrEqual(b.innerHeight);
  const gap = b.top >= lines.bottom ? b.top - lines.bottom : lines.top - b.bottom;
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(20);
});

// Past the 32 text nodes the page-order walk reads: only a look through the clear field sees line 33.
test('a code-view selection with code on the next line and room above puts the bubble above, off that line', async () => {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${ext.serverUrl}/code-view-page.html`);
  await waitForTestHooks(page);
  await page.locator('#read-only-cursor-text-area').waitFor();
  // Line 32 is `    <h1>Comment thread fixture</h1>`; lines 30 and 31 end left of column 12, line 33 runs past it.
  const at = await page.evaluate(() => {
    const line = document.getElementById('LC32');
    const text = line?.firstChild;
    if (!line || !(text instanceof Text)) throw new Error('no line 32');
    line.scrollIntoView({ block: 'center' });
    const r = document.createRange();
    r.setStart(text, 12);
    r.setEnd(text, 13);
    const first = r.getBoundingClientRect();
    r.setStart(text, text.length - 1);
    r.setEnd(text, text.length);
    return { x0: first.left + 1, x1: r.getBoundingClientRect().right + 20, y: first.top + 10 };
  });
  await page.mouse.move(at.x0, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x1, at.y, { steps: 8 });
  await page.mouse.up();
  const selected = await page.evaluate(() => {
    const ta = document.activeElement;
    return ta instanceof HTMLTextAreaElement
      ? ta.value.slice(ta.selectionStart, ta.selectionEnd)
      : '';
  });
  expect(selected).toBe('ent thread fixture</h1>');

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const b = await egaTest<{ top: number; bottom: number }>(page, 'bubbleRect');
  if (!b) throw new Error('no bubble');
  const lines = await page.evaluate(() => {
    const box = (id: string): Box => {
      const r = document.getElementById(id)?.getBoundingClientRect();
      return { top: r?.top ?? NaN, bottom: r?.bottom ?? NaN };
    };
    return { own: box('LC32'), next: box('LC33') };
  });
  expect(b.bottom <= lines.next.top || b.top >= lines.next.bottom).toBe(true);
  expect(b.bottom).toBeLessThanOrEqual(lines.own.top);
  expect(lines.own.top - b.bottom).toBeLessThanOrEqual(20);
});

test('a word picked in a wrapping comment box puts the bubble under that word, not under the box', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/code-view-page.html`);
  await waitForTestHooks(page);
  const box = await page.locator('#comment').boundingBox();
  if (!box) throw new Error('no comment box');
  // The box's second line: line-height is normal, so about 17px a line.
  const y = box.y + 28;
  await page.mouse.dblclick(box.x + 40, y);
  const word = await page.evaluate(() => {
    const ta = document.activeElement;
    return ta instanceof HTMLTextAreaElement
      ? ta.value.slice(ta.selectionStart, ta.selectionEnd)
      : '';
  });
  expect(word.trim()).not.toBe('');

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const b = await egaTest<{ top: number }>(page, 'bubbleRect');
  if (!b) throw new Error('no bubble');
  expect(b.top - y).toBeGreaterThanOrEqual(0);
  expect(b.top - y).toBeLessThanOrEqual(30);
  expect(b.top).toBeLessThan(box.y + box.height - 40);
});
