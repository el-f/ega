/* coverage: translation.tooltip.multi-variety-cluster */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertA11y, createTimeline, waitForVisibleText } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
    confidencePill: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('multi-variety detection renders the pill cluster (length>1)', async () => {
  const timeline = createTimeline();

  mockAnthropic(ext.context, {
    translation: 'Welcome',
    confidence: 0.95,
    detectedLangs: [
      { id: 'arabizi', detail: 'Levantine' },
      { id: 'en', detail: 'English' },
    ],
  });

  const page = await ext.context.newPage();
  // A pill caught mid-fade reads as low contrast; measure the settled tooltip.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome');
  timeline.markStep('body-visible');

  const cluster = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const c = root?.querySelector('.tooltip [data-ega-meta-item="direction"]');
    if (!c) return null;
    return {
      pillCount: 1,
    };
  });
  expect(cluster).not.toBeNull();
  expect(cluster?.pillCount).toBe(1);

  // The single-variety pill must not render next to the cluster.
  const singlePillCount = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    // The direction pill shares .lang styling; only the single-variety pill must be absent.
    return root?.querySelectorAll('.tooltip .meta .lang:not([data-ega-direction])').length ?? 0;
  });
  expect(singlePillCount).toBe(0);

  // The pills are 11px text on a tint, so they need 4.5:1; the single-variety smoke never renders one.
  await assertA11y(page);
  // axe files the pills under "incomplete" (it cannot settle a translucent tint), so compute the ratio here.
  const ratios = await page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const parse = (c: string): Rgba => {
      const [r = 0, g = 0, b = 0, a = 1] = (c.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, a];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3];
      return [0, 1, 2].map((i) => (top[i] ?? 0) * a + (under[i] ?? 0) * (1 - a)).concat(1) as Rgba;
    };
    const lum = (c: Rgba): number => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    const root = document.querySelector('#ega-shadow-host')?.shadowRoot;
    return Array.from(
      root?.querySelectorAll<HTMLElement>('.tooltip [data-ega-meta-item="direction"]') ?? [],
    ).map((pill) => {
      // Stack the backgrounds from the pill outwards until one is opaque, then blend them down.
      const layers: Rgba[] = [];
      let el: Element | null = pill;
      while (el) {
        const bg = parse(getComputedStyle(el).backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 1) break;
        el = el.parentElement;
      }
      let bg: Rgba = [255, 255, 255, 1];
      for (const layer of layers.reverse()) bg = over(layer, bg);
      const fg = over(parse(getComputedStyle(pill).color), bg);
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
    });
  });
  expect(ratios).toHaveLength(1);
  for (const r of ratios) expect(r).toBeGreaterThanOrEqual(4.5);
  timeline.markStep('pills-contrast-checked');
});
