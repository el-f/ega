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

let ext: ExtensionHandle;
test.beforeEach(async () => {
  ext = await launchExtension();
  await seedCustomTasks(ext.context, ext.extensionId, [
    customTask({
      id: 'c-chart',
      label: 'Chart check',
      output: 'card',
      image: true,
      answer: { v: 1, fields },
    }),
  ]);
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
}

/** With `toEnd`, first scrolls every box around the last note to its end. */
async function fit(page: Page, toEnd = false): Promise<Fit> {
  return page.evaluate((scroll) => {
    const card = document
      .querySelector('#ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLElement>('.tooltip');
    const item = card?.querySelector('.answer-main-list li');
    const note = card?.querySelector('[data-ega-note="headline"]');
    const body = item?.closest('.body');
    if (!card || !item || !note || !body) {
      return { outside: ['no settled card'], firstLine: false, listAtTop: false, lastNote: 0 };
    }
    if (scroll) {
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
    const first = shown(item);
    const firstLine =
      first.top - item.getBoundingClientRect().top < 0.5 &&
      first.height >= Number.parseFloat(getComputedStyle(item).lineHeight) - 0.5;
    const listAtTop = item.getBoundingClientRect().top - body.getBoundingClientRect().top < 0.5;
    const noteText = note.querySelector('.answer-note-text') ?? note;
    return { outside, firstLine, listAtTop, lastNote: share(noteText) };
  }, toEnd);
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
    // Below the middle and past the bottom: the card opens above the chart with less room than it needs.
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
      // The fixture body has a 40px top margin.
      { src: CHART, top: Math.round(height * 0.45) - 40 },
    );

    const opts = await ext.context.newPage();
    await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    const handle = await sendImageTranslatePending(opts, ext.serverUrl, CHART);
    await sendImageTranslateResult(opts, handle, {
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
    });
    await page.bringToFront();

    const card = page.locator('.tooltip');
    await expect(card.locator('[data-ega-note="headline"]')).toContainText(headline);
    await expect(card.locator('.actions')).toBeVisible();
    await card.evaluate(async (el) => {
      await el.querySelector('img')?.decode();
      await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished));
    });
    await page.screenshot({ path: info.outputPath(`image-tooltip-${theme}-${width}.png`) });

    await expect
      .poll(() => fit(page))
      .toMatchObject({ outside: [], firstLine: true, listAtTop: true });
    await expect.poll(() => fit(page, true)).toMatchObject({ outside: [], lastNote: 1 });
  });
}
