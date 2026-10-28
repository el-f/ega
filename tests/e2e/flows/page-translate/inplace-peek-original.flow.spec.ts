/* coverage: vision.page-translate.inplace-peek-original */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  onlyBackends,
  pickAreasAndTranslate,
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
    ...onlyBackends('anthropic'),
    streaming: true,
    pageTranslateMode: 'inplace',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('holding the mouse on a Replace text block shows the page words; letting go shows the translation', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });
  const original = 'mar7aba habibi, kifak? shu 3am ta3mel?';

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  // An element inside the block: Replace text hides the page's own element where it stands.
  await page.evaluate(() => {
    const c1 = document.getElementById('c1');
    if (!c1) throw new Error('c1 missing');
    c1.innerHTML = 'mar7aba <b>habibi</b>, kifak? shu 3am ta3mel?';
  });

  await pickAreasAndTranslate(ext, page, ['c1']);
  timeline.markStep('translate-dispatched');

  const wrapper = page.locator('#c1 > [data-ega-replaced]');
  await expect(wrapper).toHaveAttribute('data-ega-tx-state', 'ok', { timeout: 10_000 });
  await expect(wrapper).toHaveText('TRANSLATED');
  // The page's <b> stays in the DOM for its framework; the page sheet hides it.
  const pageBold = page.locator('#c1 > b');
  await expect(pageBold).toHaveAttribute('data-ega-hidden', '');
  await expect(pageBold).toBeHidden();

  await wrapper.hover();
  await page.mouse.down();
  timeline.markStep('peek-pressed');
  await expect(wrapper).toHaveAttribute('data-ega-peek', '');
  await expect(wrapper).toHaveText(original);
  await expect(wrapper.locator('b')).toBeVisible();
  // The page's copy keeps its own spacing, not the translation's line breaks.
  expect(await wrapper.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('normal');

  await page.mouse.up();
  timeline.markStep('peek-released');
  await expect(wrapper).not.toHaveAttribute('data-ega-peek');
  await expect(wrapper).toHaveText('TRANSLATED');
  expect(await wrapper.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre-line');
  await expect(pageBold).toBeHidden();
});
