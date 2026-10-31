import { test, expect, type Page } from '@playwright/test';
import {
  customTask,
  launchExtension,
  seedCustomTasks,
  seedSettings,
  sendImageTranslatePending,
  sendImageTranslateResult,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

const fields = [
  { key: 'looksVsIs', label: 'Looks vs is', kind: 'list', role: 'main', required: true },
  {
    key: 'verdict',
    label: 'Verdict',
    kind: 'choice',
    role: 'notes',
    required: true,
    choices: ['Fair', 'Stretches it'],
  },
  { key: 'headline', label: 'Honest headline', kind: 'text', role: 'notes', required: true },
] as const;
const looksVsIs = [
  'Looks like ~1.4x (bar ~480px vs ~350px); really +10% (1.00x implied to 1.10x), last group',
  'Looks like ~30% slower (bar ~240px vs ~350px); really -7% (1.00x implied to 0.93x), third group',
  'No value axis shown, and the bars do not start at zero, so every gap looks 3-4x bigger than printed',
];
const headline =
  'In this test, system A ran 0.93x to 1.10x the speed of system B, ahead in 3 of 4 cases by 5-10% and behind by 7% in one.';
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">',
  '<rect width="800" height="1000" fill="#111"/>',
  '<rect x="120" y="300" width="100" height="650" fill="#0aa"/>',
  '<rect x="260" y="420" width="100" height="530" fill="#999"/>',
  '<rect x="420" y="520" width="100" height="430" fill="#0aa"/>',
  '<rect x="560" y="420" width="100" height="530" fill="#999"/>',
  '</svg>',
].join('');
// Taller than wide, so the preview fills its height cap.
const CHART = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const wideSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">',
  '<rect width="800" height="400" fill="#111"/>',
  '<rect x="120" y="100" width="560" height="200" fill="#0aa"/>',
  '</svg>',
].join('');
// Wider than tall, so the loading preview is wide enough for its caption.
const WIDE = `data:image/svg+xml;base64,${Buffer.from(wideSvg).toString('base64')}`;

const chartTask = {
  id: 'c-chart',
  label: 'Chart check',
  output: 'card',
  image: true,
  answer: { v: 1, fields },
};
type ImageResult = Parameters<typeof sendImageTranslateResult>[2];
const chartResult: ImageResult = {
  translation: looksVsIs.join('\n'),
  task: 'c-chart',
  notes: [
    { key: 'verdict', label: 'Verdict', text: 'Stretches it' },
    { key: 'headline', label: 'Honest headline', text: headline },
  ],
  answer: {
    spec: { id: 'c-chart', version: 1, fields, join: 'after-build' },
    fields: { looksVsIs, verdict: 'Stretches it', headline },
  },
};

let ext: ExtensionHandle;
test.beforeEach(async () => {
  ext = await launchExtension();
  await seedCustomTasks(ext.context, ext.extensionId, [customTask(chartTask)]);
});
test.afterEach(async () => {
  await ext.close();
});

interface Fit {
  /** Elements whose painted box leaves the card, and the card itself when it leaves the viewport. */
  outside: string[];
  /** The answer starts in view: its first line is not clipped. */
  firstLine: boolean;
  /** The list starts on the body's first line, with no gap above it. */
  listAtTop: boolean;
  /** Share of the last note's height that shows through the boxes that clip it. */
  lastNote: number;
  /** Pixels the card's rows run past its content box, into the bottom padding or beyond. */
  spill: number;
  /** Height of the image preview. */
  preview: number;
}

/** With `toEnd`, first scrolls every box around the last note to its end. */
async function fit(page: Page, toEnd = false): Promise<Fit> {
  return page.evaluate((scroll) => {
    const card = document
      .querySelector('#ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLElement>('.tooltip');
    const reply = card?.querySelector('.tooltip-reply');
    if (!card || !reply) {
      return {
        outside: ['no card'],
        firstLine: false,
        listAtTop: false,
        lastNote: 0,
        spill: 0,
        preview: 0,
      };
    }
    // Absent until the reply settles: a loading card is checked for fit only.
    const item = card.querySelector('.answer-main-list li');
    const note = card.querySelector('[data-ega-note="headline"]');
    const body = item?.closest('.body');
    if (scroll && note) {
      for (let a = note.parentElement; a && a !== card; a = a.parentElement) {
        a.scrollTop = a.scrollHeight;
      }
    }
    // The part of an element left after every clipping ancestor inside the card.
    const shown = (el: Element): DOMRect => {
      const r = el.getBoundingClientRect();
      let { top, bottom, left, right } = r;
      for (let a = el.parentElement; a && a !== card; a = a.parentElement) {
        if (getComputedStyle(a).overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        top = Math.max(top, c.top);
        bottom = Math.min(bottom, c.bottom);
        left = Math.max(left, c.left);
        right = Math.min(right, c.right);
      }
      return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    };
    const share = (el: Element): number =>
      Math.round((100 * shown(el).height) / Math.max(1, el.getBoundingClientRect().height)) / 100;
    const box = card.getBoundingClientRect();
    const outside: string[] = [];
    if (box.top < 0 || box.bottom > window.innerHeight) {
      outside.push(`card ${Math.round(box.top)}-${Math.round(box.bottom)}`);
    }
    for (const el of card.querySelectorAll('*')) {
      if (el.closest('.ega-sr-only')) continue;
      const s = shown(el);
      if (s.height < 1 || s.width < 1) continue;
      if (
        s.top < box.top - 1 ||
        s.bottom > box.bottom + 1 ||
        s.left < box.left - 1 ||
        s.right > box.right + 1
      ) {
        const name = [el.tagName.toLowerCase(), ...el.classList].join('.');
        outside.push(
          `${name} ${Math.round(s.top)}-${Math.round(s.bottom)} past card ${Math.round(box.top)}-${Math.round(box.bottom)}`,
        );
      }
    }
    const rowsEnd = Math.max(...[...reply.children].map((r) => r.getBoundingClientRect().bottom));
    const spill = Math.max(0, Math.round(rowsEnd - reply.getBoundingClientRect().bottom));
    const preview = Math.round(
      card.querySelector('.tooltip-image-source')?.getBoundingClientRect().height ?? 0,
    );
    if (!item || !note || !body) {
      return { outside, firstLine: false, listAtTop: false, lastNote: 0, spill, preview };
    }
    const first = shown(item);
    const firstLine =
      first.top - item.getBoundingClientRect().top < 0.5 &&
      first.height >= Number.parseFloat(getComputedStyle(item).lineHeight) - 0.5;
    const listAtTop = item.getBoundingClientRect().top - body.getBoundingClientRect().top < 0.5;
    const noteText = note.querySelector('.answer-note-text') ?? note;
    return { outside, firstLine, listAtTop, lastNote: share(noteText), spill, preview };
  }, toEnd);
}

/** `ok` when the answer region and About each show at least two lines, else the line counts. */
function twoLinesEach(page: Page): Promise<string> {
  return page.locator('.tooltip').evaluate((card) => {
    const lh = Number.parseFloat(getComputedStyle(card).lineHeight);
    const lines = (sel: string) =>
      Math.round((10 * (card.querySelector(sel)?.clientHeight ?? 0)) / lh) / 10;
    const shown = { answer: lines('.tooltip-scroll'), about: lines('.ega-tooltip-details') };
    return shown.answer >= 2 && shown.about >= 2 ? 'ok' : JSON.stringify(shown);
  });
}

/** Where the loading overlay paints against the preview image: `on the image` and `inside the image` are the good results. */
function overlay(page: Page): Promise<{ shimmer: string; caption: string }> {
  return page.locator('.tooltip .tooltip-image-wrap').evaluate((wrap) => {
    const root = wrap.getRootNode() as ShadowRoot;
    const img = wrap.querySelector('.tooltip-image-source');
    const shimmer = wrap.querySelector('.tooltip-image-shimmer');
    const caption = wrap.querySelector('.tooltip-image-caption');
    if (!img || !shimmer || !caption) return { shimmer: 'missing', caption: 'missing' };
    const at = (r: DOMRect) =>
      `x ${Math.round(r.left)}-${Math.round(r.right)} y ${Math.round(r.top)}-${Math.round(r.bottom)}`;
    const i = img.getBoundingClientRect();
    const s = shimmer.getBoundingClientRect();
    const c = caption.getBoundingClientRect();
    const covers = [s.left - i.left, s.right - i.right, s.top - i.top, s.bottom - i.bottom].every(
      (d) => Math.abs(d) < 1,
    );
    const inside =
      c.left >= i.left - 0.5 &&
      c.right <= i.right + 0.5 &&
      c.top >= i.top - 0.5 &&
      c.bottom <= i.bottom + 0.5;
    // A caption hidden by position-visibility keeps its box and reads visible to the DOM; only hit testing skips it.
    const painted = root
      .elementsFromPoint(c.left + c.width / 2, c.top + c.height / 2)
      .includes(caption);
    return {
      shimmer: covers ? 'on the image' : `${at(s)}, image ${at(i)}`,
      caption: !painted ? 'hidden' : inside ? 'inside the image' : `${at(c)}, image ${at(i)}`,
    };
  });
}

/** Below the middle and past the bottom: the card opens above the chart with less room than it needs. */
async function chartPage(
  theme: 'light' | 'dark',
  width: number,
  height: number,
  // The fixture body has a 40px top margin.
  marginTop = Math.round(height * 0.45) - 40,
  src = CHART,
): Promise<{ page: Page; send: (result: ImageResult) => Promise<void> }> {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    tooltipClickOutside: false,
    imageTranslateSurface: 'tooltip',
    theme,
  });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.evaluate(
    async ({ src, top }) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Chart';
      img.style.cssText = `display:block;width:100%;height:auto;margin-top:${top}px`;
      document.body.prepend(img);
      await img.decode();
      window.scrollTo(0, 0);
    },
    { src, top: marginTop },
  );

  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  const handle = await sendImageTranslatePending(opts, ext.serverUrl, src);
  return {
    page,
    send: async (result) => {
      await sendImageTranslateResult(opts, handle, result);
      await page.bringToFront();
    },
  };
}

/** Sends the chart reply and waits for the decoded preview, the last note and the end of every animation. */
async function showChartReply(page: Page, send: (result: ImageResult) => Promise<void>) {
  await send(chartResult);
  const card = page.locator('.tooltip');
  await expect(card.locator('[data-ega-note="headline"]')).toContainText(headline);
  await expect(card.locator('.actions')).toBeVisible();
  await card.evaluate(async (el) => {
    await el.querySelector('img')?.decode();
    await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished));
  });
}

for (const { theme, width, height } of [
  { theme: 'light', width: 1280, height: 800 },
  { theme: 'dark', width: 1280, height: 800 },
  { theme: 'light', width: 400, height: 720 },
  { theme: 'dark', width: 400, height: 720 },
] as const) {
  test(`a tall image with a long typed-fields reply stays inside the card, ${theme} at ${width}px`, async ({
    browserName: _browserName,
  }, info) => {
    const { page, send } = await chartPage(theme, width, height);
    await showChartReply(page, send);
    await page.screenshot({ path: info.outputPath(`image-tooltip-${theme}-${width}.png`) });

    await expect
      .poll(() => fit(page))
      .toMatchObject({ outside: [], firstLine: true, listAtTop: true });
    await expect.poll(() => fit(page, true)).toMatchObject({ outside: [], lastNote: 1 });
  });
}

for (const { width, height } of [
  { width: 1280, height: 800 },
  { width: 400, height: 720 },
] as const) {
  test(`About on an image card keeps the first answer line in view at ${width}px`, async ({
    browserName: _browserName,
  }, info) => {
    const { page, send } = await chartPage('light', width, height);
    await showChartReply(page, send);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: 'About this reply' }).click();
    await expect(page.locator('[data-ega-inspector]')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`image-tooltip-about-${width}.png`) });

    await expect.poll(() => fit(page)).toMatchObject({ outside: [], firstLine: true });
    // The preview gives way first, so neither the answer nor About is squeezed into a sliver.
    await expect.poll(() => twoLinesEach(page)).toBe('ok');
  });

  test(`a loading image card keeps its rows and Stop inside the card at ${width}px`, async ({
    browserName: _browserName,
  }, info) => {
    const { page } = await chartPage('light', width, height);
    await page.bringToFront();
    const card = page.locator('.tooltip');
    await expect(card.locator('.tooltip-image-wrap.is-loading')).toBeVisible();
    await card.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`image-tooltip-loading-${width}.png`) });

    await expect.poll(() => fit(page)).toMatchObject({ outside: [], spill: 0 });
    // The shrunk tall preview has no room for the caption, so it hides instead of floating beside the image.
    await expect.poll(() => overlay(page)).toEqual({ shimmer: 'on the image', caption: 'hidden' });
  });
}

test('a loading wide image shows its caption on the image', async ({
  browserName: _browserName,
}, info) => {
  const { page } = await chartPage('light', 1280, 800, undefined, WIDE);
  await page.bringToFront();
  await expect(page.locator('.tooltip .tooltip-image-wrap.is-loading')).toBeVisible();
  await page.locator('.tooltip img').evaluate((img: HTMLImageElement) => img.decode());
  await page.screenshot({ path: info.outputPath('image-tooltip-loading-wide.png') });

  await expect
    .poll(() => overlay(page))
    .toEqual({ shimmer: 'on the image', caption: 'inside the image' });
});

/** Chrome 123-128 drop position-area: drop it here too and apply the sheet's fallback block, as those versions do. */
async function withoutPositionArea(page: Page): Promise<void> {
  await page.locator('.tooltip').evaluate((card) => {
    const root = card.getRootNode() as ShadowRoot;
    const fallback = [...root.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find(
        (r): r is CSSSupportsRule =>
          r instanceof CSSSupportsRule && r.conditionText.includes('position-area'),
      );
    if (!fallback) throw new Error('the tooltip sheet has no fallback for position-area');
    const style = document.createElement('style');
    style.textContent = [
      ...Array.from(fallback.cssRules, (r) => r.cssText),
      '.tooltip .tooltip-image-shimmer, .tooltip .tooltip-image-caption { position-area: none !important; position-visibility: always !important; }',
    ].join('\n');
    root.appendChild(style);
  });
}

for (const { name, width, height, src } of [
  { name: 'a tall image at 400px', width: 400, height: 720, src: CHART },
  { name: 'a wide image at 1280px', width: 1280, height: 800, src: WIDE },
] as const) {
  test(`with no position-area (Chrome 123-128) a loading ${name} shows no overlay beside it`, async ({
    browserName: _browserName,
  }, info) => {
    const { page } = await chartPage('light', width, height, undefined, src);
    await page.bringToFront();
    await expect(page.locator('.tooltip .tooltip-image-wrap.is-loading')).toBeVisible();
    await page.locator('.tooltip img').evaluate((img: HTMLImageElement) => img.decode());
    const shimmer = page.locator('.tooltip .tooltip-image-shimmer');
    const caption = page.locator('.tooltip .tooltip-image-caption');
    await expect(shimmer).toBeVisible();
    await expect(caption).toBeVisible();
    await withoutPositionArea(page);
    await page.screenshot({ path: info.outputPath(`image-tooltip-loading-fallback-${width}.png`) });

    // Without the image as its anchor the overlay would fill the row, so neither piece shows and the rows stay put.
    await expect(shimmer).toBeHidden();
    await expect(caption).toBeHidden();
    await expect.poll(() => fit(page)).toMatchObject({ outside: [], spill: 0 });
  });
}

// Room just over the 200px floor (MIN_TOOLTIP_BLOCK) above the image: image top - 8px gap - 20px margin.
for (const side of [201, 206]) {
  test(`an image card with ${side}px above the image keeps every row inside the card`, async ({
    browserName: _browserName,
  }) => {
    // The image's top margin collapses into the body's, so it is the image's top.
    const { page, send } = await chartPage('light', 400, 720, side + 28);
    await showChartReply(page, send);

    await expect.poll(() => fit(page)).toMatchObject({ outside: [], firstLine: true, spill: 0 });
    // MIN_TOOLTIP_BLOCK holds the preview row too: at the floor it still shows the image.
    expect((await fit(page)).preview).toBeGreaterThanOrEqual(40);
  });
}

test('a long one-word custom task name wraps in the header and keeps Close on the card', async ({
  browserName: _browserName,
}, info) => {
  // One word, just under the 40-character label cap.
  const label = 'Bildunterschriftenuebersetzungspruefung';
  await seedCustomTasks(ext.context, ext.extensionId, [customTask({ ...chartTask, label })]);
  const { page, send } = await chartPage('light', 256, 720);
  await showChartReply(page, send);
  await expect(page.locator('.tooltip .tooltip-topbar-title')).toHaveText(label);
  await page.screenshot({ path: info.outputPath('image-tooltip-long-label-256.png') });

  await expect.poll(() => fit(page)).toMatchObject({ outside: [] });
});

test('long error details wrap inside the image card instead of scrolling sideways', async ({
  browserName: _browserName,
}, info) => {
  const message =
    'upstream request failed with status 502 while reading the response body from the provider gateway';
  const { page, send } = await chartPage('light', 400, 720);
  await send({ translation: '', task: 'c-chart', error: { code: 'NETWORK', message } });
  await page.getByRole('button', { name: /^Details/ }).click();
  await expect(page.locator('.tooltip .tooltip-error-details')).toHaveText(message);
  await page.screenshot({ path: info.outputPath('image-tooltip-error-details.png') });

  await expect
    .poll(() =>
      page.locator('.tooltip .tooltip-scroll').evaluate((el) => el.scrollWidth - el.clientWidth),
    )
    .toBe(0);
});
