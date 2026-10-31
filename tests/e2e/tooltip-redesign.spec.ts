import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;
test.afterEach(async () => {
  await ext.close();
});

async function open(
  width = 400,
  theme = 'light',
  {
    height = 800,
    explain,
    translation = 'Welcome, how are you?',
    settings = {},
  }: {
    height?: number;
    explain?: string;
    /** Starts with "Welcome", which open() waits for. */
    translation?: string;
    settings?: Record<string, unknown>;
  } = {},
): Promise<{ page: Page; mock: ReturnType<typeof mockAnthropic> }> {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: true,
    captureResultMeta: true,
    defaultLang: 'fr',
    defaultTargetLang: 'en',
    theme,
    ...settings,
  });
  const mock = mockAnthropic(ext.context, {
    translation,
    confidence: 0.4,
    ...(explain !== undefined ? { explain } : {}),
  });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await expect(page.locator('.tooltip .body')).toContainText('Welcome');
  await expect(page.getByRole('button', { name: 'Regenerate', exact: true })).toBeVisible();
  return { page, mock };
}

/** At least one line of the answer shows through every box that clips it. */
function answerLineShows(page: Page): Promise<boolean> {
  return page.locator('.tooltip .body').evaluate((body) => {
    let { top, bottom } = body.getBoundingClientRect();
    for (let a = body.parentElement; a && !a.classList.contains('tooltip'); a = a.parentElement) {
      if (getComputedStyle(a).overflowY === 'visible') continue;
      const c = a.getBoundingClientRect();
      top = Math.max(top, c.top);
      bottom = Math.min(bottom, c.bottom);
    }
    return bottom - top >= Number.parseFloat(getComputedStyle(body).lineHeight) - 0.5;
  });
}

for (const theme of ['light', 'dark']) {
  for (const width of [400, 320, 256]) {
    test(`tooltip layout and menus at ${width}px in ${theme}`, async ({
      browserName: _browserName,
    }, info) => {
      const { page } = await open(width, theme);
      const row = page.locator('[data-ega-tooltip-actions]');
      // Copy, Ask, Regenerate, Refine, Open in side panel, More: 6 x 32 + 5 x 4 = 212 of the 246 px content box.
      await expect(row.getByRole('button')).toHaveCount(6);
      const rects = await row.getByRole('button').evaluateAll((buttons) =>
        buttons.map((b) => {
          const r = b.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right };
        }),
      );
      expect(new Set(rects.map((r) => Math.round(r.top))).size).toBe(1);
      expect(rects.every((r) => r.left >= 0 && r.right <= width)).toBe(true);
      await expect(page.locator('[data-ega-reply-meta]')).toContainText('Low confidence (40%)');
      await page.screenshot({ path: info.outputPath(`tooltip-${width}-${theme}.png`) });

      const more = page.getByRole('button', { name: 'More', exact: true });
      await more.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitemcheckbox', { name: 'About this reply' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(more).toBeFocused();
      await expect(page.locator('.tooltip')).toBeVisible();
      await more.click();
      await page.getByRole('menuitemcheckbox', { name: 'About this reply' }).click();
      await expect(page.locator('[data-ega-inspector]')).toBeVisible();
      // ResizeObserver repositions the expanded card after its new layout is measured.
      await expect
        .poll(async () => {
          const aboutBox = await page.locator('.tooltip').boundingBox();
          if (!aboutBox) throw new Error('No tooltip bounds');
          return aboutBox.y + aboutBox.height;
        })
        .toBeLessThanOrEqual(800);
      // About scrolls internally without shrinking the answer to a clipped sliver.
      await expect.poll(() => answerLineShows(page)).toBe(true);
      await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(1);
      await page.screenshot({ path: info.outputPath(`tooltip-about-${width}-${theme}.png`) });
      await page.getByRole('button', { name: 'Refine', exact: true }).click();
      await expect(page.getByRole('menuitem', { name: 'Shorter', exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`tooltip-refine-${width}-${theme}.png`) });
    });
  }
}

test('About squeezes long notes into a scroll box instead of painting them over the actions', async ({
  browserName: _browserName,
}, info) => {
  const explain = Array.from(
    { length: 6 },
    () => 'This expression mocks a total split of forces into scattered thirds.',
  ).join(' ');
  const { page } = await open(400, 'dark', { height: 520, explain });
  await expect(page.locator('[data-ega-explain]')).toBeVisible();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'About this reply' }).click();
  await expect(page.locator('[data-ega-inspector]')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.tooltip-reply').evaluate((reply) => {
        const notes = reply.querySelector<HTMLElement>('[data-ega-explain]');
        const meta = reply.querySelector<HTMLElement>('[data-ega-reply-meta]');
        if (!notes || !meta) return 'missing';
        const spills =
          notes.scrollHeight > notes.clientHeight + 1 &&
          getComputedStyle(notes).overflowY === 'visible';
        let bottom = notes.getBoundingClientRect().bottom;
        for (let a = notes.parentElement; a && a !== reply; a = a.parentElement) {
          if (getComputedStyle(a).overflowY !== 'visible') {
            bottom = Math.min(bottom, a.getBoundingClientRect().bottom);
          }
        }
        const overlaps = bottom > meta.getBoundingClientRect().top;
        return spills || overlaps ? 'overlap' : 'ok';
      }),
    )
    .toBe('ok');
  await page.screenshot({ path: info.outputPath('tooltip-about-long-notes.png') });
});

test('About in a short card keeps an answer line in view with Show source on', async ({
  browserName: _browserName,
}, info) => {
  const { page } = await open(400, 'dark', { height: 520, settings: { tooltipShowSource: true } });
  await expect(page.locator('.tooltip .src')).toBeVisible();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'About this reply' }).click();
  await expect(page.locator('[data-ega-inspector]')).toBeVisible();
  await expect.poll(() => answerLineShows(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('tooltip-about-show-source.png') });
});

test('a long answer with notes scrolls in one box, and every Tab stop in the card shows its whole focus ring', async ({
  browserName: _browserName,
}, info) => {
  const sentence = 'This sentence makes the answer long enough to scroll inside the card.';
  const { page } = await open(1280, 'light', {
    translation: `Welcome. ${Array.from({ length: 30 }, () => sentence).join(' ')}`,
    explain: Array.from({ length: 6 }, () => 'This note adds more lines under the answer.').join(
      ' ',
    ),
  });
  await expect(page.locator('[data-ega-explain]')).toBeVisible();
  const scrollers = (): Promise<string[]> =>
    page
      .locator('.tooltip')
      .evaluate((card) =>
        [...card.querySelectorAll('*')]
          .filter(
            (el) =>
              /auto|scroll/.test(getComputedStyle(el).overflowY) &&
              el.scrollHeight > el.clientHeight + 1,
          )
          .map((el) => [el.tagName.toLowerCase(), ...el.classList].join('.')),
      );
  await expect.poll(async () => (await scrollers()).length).toBeGreaterThan(0);
  const boxes = await scrollers();

  // Chrome makes a scroll box with nothing focusable inside a Tab stop of its own.
  const stops: { name: string; clipped: boolean }[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
      const card = root?.querySelector('.tooltip');
      const el = root?.activeElement;
      if (!card || !el || el === card || !card.contains(el)) return null;
      const name = [el.tagName.toLowerCase(), ...el.classList].join('.');
      const s = getComputedStyle(el);
      const out =
        s.outlineStyle === 'none'
          ? 0
          : Math.max(0, Number.parseFloat(s.outlineOffset) + Number.parseFloat(s.outlineWidth));
      const r = el.getBoundingClientRect();
      for (let a = el.parentElement; a && a !== card; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (as.overflowX === 'visible' && as.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        if (
          r.top - out < c.top - 0.5 ||
          r.bottom + out > c.bottom + 0.5 ||
          r.left - out < c.left - 0.5 ||
          r.right + out > c.right + 0.5
        ) {
          return { name, clipped: true };
        }
      }
      return { name, clipped: false };
    });
    if (stop) stops.push(stop);
  }
  await page.screenshot({ path: info.outputPath('tooltip-long-answer-focus.png') });
  expect({
    boxes,
    clipped: stops.filter((s) => s.clipped),
    // Proves the walk reached the scroll box, so the ring check covers it.
    scrollBoxIsStop: stops.some((s) => s.name === 'div.tooltip-scroll'),
  }).toEqual({ boxes: ['div.tooltip-scroll'], clipped: [], scrollBoxIsStop: true });
});

test('long notes fill the room beside the selection, not only 40vh of it', async ({
  browserName: _browserName,
}, info) => {
  const { page } = await open(1280, 'light', {
    explain: Array.from({ length: 40 }, () => 'This note adds more lines under the answer.').join(
      ' ',
    ),
  });
  await expect(page.locator('[data-ega-explain]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('tooltip-long-notes-1280.png') });

  // The 40vh cap holds an answer with no notes; notes may take the rest of the card, as before the shared region.
  await expect
    .poll(() =>
      page.locator('.tooltip .tooltip-scroll').evaluate((el) => {
        const tall = el.scrollHeight > el.clientHeight && el.clientHeight > 0.5 * innerHeight;
        return tall ? 'fills' : `${el.clientHeight} of ${el.scrollHeight}px`;
      }),
    )
    .toBe('fills');
  const box = await page.locator('.tooltip').boundingBox();
  expect(box && box.y >= 0 && box.y + box.height <= 800).toBe(true);
});

test('Regenerate bypasses the saved answer and Refine sends a per-request change', async () => {
  const { page, mock } = await open();
  const before = mock.calls();
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect.poll(() => mock.calls()).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Refine', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Shorter', exact: true }).click();
  await expect.poll(() => mock.lastRequestBody()).toContain('Make outputs shorter.');
  await expect(page.locator('.tooltip .body')).toContainText('Welcome');
  await expect(page.locator('[data-ega-diff]')).toHaveCount(0);
});

test('Stop keeps keyboard focus on the retained reply recovery action', async () => {
  const { page } = await open(256, 'dark');
  await ext.context.unroute('https://api.anthropic.com/v1/messages');
  mockAnthropic(ext.context, { translation: 'Late answer', delayMs: 2000 });
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeFocused();
  await expect(page.locator('[data-ega-tooltip-live]')).toContainText('Stopped. No answer yet.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tooltip')).toHaveCount(0);
});

/** Rows past the reply's edge, and how the change input and Apply show through every box that clips them. */
function editorFit(
  page: Page,
): Promise<{ spill: number; inView: boolean; input: string; apply: string }> {
  return page.locator('.tooltip').evaluate((card) => {
    const reply = card.querySelector('.tooltip-reply');
    const input = card.querySelector('.tooltip-editor textarea');
    const apply = card.querySelector('.tooltip-editor-actions button');
    if (!reply || !input || !apply) {
      return { spill: -1, inView: false, input: 'missing', apply: 'missing' };
    }
    const shows = (el: Element): string => {
      const r = el.getBoundingClientRect();
      let { top, bottom } = r;
      for (let a = el.parentElement; a && a !== card; a = a.parentElement) {
        if (getComputedStyle(a).overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        top = Math.max(top, c.top);
        bottom = Math.min(bottom, c.bottom);
      }
      const shown = Math.max(0, bottom - top);
      return shown >= r.height - 0.5
        ? 'whole'
        : `${Math.round(shown)} of ${Math.round(r.height)}px`;
    };
    const rowsEnd = Math.max(...[...reply.children].map((r) => r.getBoundingClientRect().bottom));
    const box = card.getBoundingClientRect();
    return {
      spill: Math.max(0, Math.round(rowsEnd - reply.getBoundingClientRect().bottom)),
      inView: box.top >= 0 && box.bottom <= window.innerHeight,
      input: shows(input),
      apply: shows(apply),
    };
  });
}

// 520px: the card opens below the selection with about 250px for its rows. 460px: the 200px floor.
for (const height of [520, 460]) {
  test(`Describe a change in a short card keeps every row inside the card at ${height}px`, async ({
    browserName: _browserName,
  }, info) => {
    const { page } = await open(400, 'light', { height, settings: { tooltipShowSource: true } });
    await expect(page.locator('.tooltip .src')).toBeVisible();
    await page.getByRole('button', { name: 'Refine', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Describe a change…', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: 'Describe a change', exact: true }),
    ).toBeFocused();

    await expect.poll(() => editorFit(page)).toMatchObject({ spill: 0, inView: true });
    await page.screenshot({ path: info.outputPath(`tooltip-editor-short-${height}.png`) });
    // Above the floor the whole editor shows; at the floor it scrolls inside the card.
    if (height === 520) {
      expect(await editorFit(page)).toMatchObject({ input: 'whole', apply: 'whole' });
    }
  });
}

// The editor scrolls, so it clips at its padding edge; the language picker draws its ring as a 3px box-shadow outside it.
for (const theme of ['light', 'dark']) {
  for (const width of [256, 1280]) {
    test(`the language picker's focus ring shows whole in the editor at ${width}px in ${theme}`, async ({
      browserName: _browserName,
    }, info) => {
      const { page } = await open(width, theme);
      await page.getByRole('button', { name: 'Refine', exact: true }).click();
      await page
        .getByRole('menuitem', { name: 'Translate into another language…', exact: true })
        .click();
      const picker = page.getByLabel('Translate into', { exact: true });
      await picker.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(picker).toBeFocused();
      const room = await picker.evaluate((el) => {
        const editor = el.closest('.tooltip-editor');
        if (!editor) return null;
        const clip = editor.getBoundingClientRect().left + editor.clientLeft;
        const r = el.getBoundingClientRect();
        const ring = Number.parseFloat(
          /([\d.]+)px$/.exec(getComputedStyle(el).boxShadow)?.[1] ?? '0',
        );
        return {
          focusVisible: el.matches(':focus-visible'),
          ring,
          start: Math.round(r.left - ring - clip),
          end: Math.round(clip + editor.clientWidth - r.right - ring),
        };
      });
      expect(room).toMatchObject({ focusVisible: true, ring: 3 });
      expect(room?.start).toBeGreaterThanOrEqual(0);
      expect(room?.end).toBeGreaterThanOrEqual(0);
      await page
        .locator('.tooltip')
        .screenshot({ path: info.outputPath(`tooltip-language-ring-${width}-${theme}.png`) });
    });
  }
}

test('Describe a change and another language apply through the Refine editor', async () => {
  const { page, mock } = await open(256);
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Describe a change…', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Describe a change', exact: true })
    .fill('Use two short sentences.');
  const beforeChange = mock.calls();
  // requestSubmit() creates a trusted SubmitEvent even when a hostile page calls it.
  await page
    .locator('.tooltip-editor form')
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page.getByRole('textbox', { name: 'Describe a change', exact: true })).toBeVisible();
  expect(mock.calls()).toBe(beforeChange);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => mock.calls()).toBeGreaterThan(beforeChange);
  await expect.poll(() => mock.lastRequestBody()).toContain('Use two short sentences.');
  await expect(page.getByRole('button', { name: 'Refine', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Translate into another language…', exact: true })
    .click();
  await expect(page.getByRole('group', { name: 'Translate into another language' })).toBeVisible();
  await page.getByLabel('Translate into', { exact: true }).selectOption({ label: 'Spanish' });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => mock.lastRequestBody()).toContain('Spanish');
  await expect(page.locator('[data-ega-meta-item="direction"]')).toContainText('Spanish');
});
