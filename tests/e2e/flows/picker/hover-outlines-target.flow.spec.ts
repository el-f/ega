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
    root?.querySelector('.picker-hint')?.setAttribute('data-ega-survive-probe', '1');
  });

  await page.locator('#pick-me').hover();
  timeline.markStep('hovered');

  // The outline is unhidden only when a rect lands, so a visible one proves the hover landed.
  await expect
    .poll(async () => (await egaTest<number>(page, 'pickerOutlineCount')) ?? 0, { timeout: 3_000 })
    .toBeGreaterThanOrEqual(1);

  const hintSurvived = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const hint = root?.querySelector('.picker-hint');
    return {
      probe: hint?.getAttribute('data-ega-survive-probe') ?? null,
      ariaLive: hint?.getAttribute('aria-live') ?? null,
      dimmers: root?.querySelectorAll('.picker-dimmer').length ?? 0,
    };
  });
  expect(hintSurvived.probe).toBe('1');
  expect(hintSurvived.ariaLive).toBe('polite');
  expect(hintSurvived.dimmers).toBe(1);

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

  await page.keyboard.press('Escape');
});
