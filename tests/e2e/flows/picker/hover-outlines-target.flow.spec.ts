/* coverage: vision.picker.hover-outlines-target */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    pickerEnabled: true,
    pickerShortcut: 'Ctrl+Shift+E',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('hover paints the picker outline at the hovered element rect', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);

  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  timeline.markStep('picker-entered');

  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);

  // Tagging the live region proves identity across the hover: a remount hands back a fresh node.
  await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    root
      ?.querySelector('[data-ega-picker-bar] [data-ega-ms-count]')
      ?.setAttribute('data-ega-survive-probe', '1');
  });

  await page.locator('#pick-me').hover();
  timeline.markStep('hovered');

  // The outline shows from the start (on the block under the pointer, or the first one in view), so wait for it to reach the target.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const t = document.getElementById('pick-me')?.getBoundingClientRect();
          const o = document
            .querySelector('#ega-shadow-host')
            ?.shadowRoot?.querySelector<HTMLElement>('[data-ega-picker-outline]:not([hidden])')
            ?.getBoundingClientRect();
          return !!t && !!o && Math.abs(o.top - t.top) < 6;
        }),
      { timeout: 3_000 },
    )
    .toBe(true);

  const hintSurvived = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const hint = root?.querySelector('[data-ega-picker-bar] [data-ega-ms-count]');
    return {
      probe: hint?.getAttribute('data-ega-survive-probe') ?? null,
      ariaLive: hint?.getAttribute('role') === 'status' ? 'polite' : null,
      dimmers: root?.querySelectorAll('.picker-dimmer').length ?? 0,
    };
  });
  expect(hintSurvived.probe).toBe('1');
  expect(hintSurvived.ariaLive).toBe('polite');
  expect(hintSurvived.dimmers).toBe(1);
  await expect(page.locator('[data-ega-picker-bar-wrap]')).toHaveCount(1);

  // The outline must overlap the target rect, not collapse to 0,0 or carry a stale offset.
  const geo = await page.evaluate(() => {
    const target = document.getElementById('pick-me');
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const outline = root?.querySelector<HTMLElement>('[data-ega-picker-outline]');
    if (!target || !outline || outline.hidden) return null;
    const t = target.getBoundingClientRect();
    const o = outline.getBoundingClientRect();
    return {
      target: { left: t.left, top: t.top, width: t.width, height: t.height },
      outline: { left: o.left, top: o.top, width: o.width, height: o.height },
    };
  });
  expect(geo).not.toBeNull();
  if (!geo) throw new Error('outline geometry missing');
  // Border + box-shadow push the outline box up to 3px outside the target on each axis.
  const SLOP = 6;
  expect(Math.abs(geo.outline.left - geo.target.left)).toBeLessThan(SLOP);
  expect(Math.abs(geo.outline.top - geo.target.top)).toBeLessThan(SLOP);
  expect(Math.abs(geo.outline.width - geo.target.width)).toBeLessThan(SLOP);

  // The page sheet shows a crosshair over page content while the mode is on, and drops it on exit.
  const cursorOver = (): Promise<string> =>
    page.locator('#pick-me').evaluate((n) => getComputedStyle(n).cursor);
  expect(await cursorOver()).toBe('crosshair');

  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-ega-picking')))
    .toBe(false);
  expect(await cursorOver()).not.toBe('crosshair');
});
