/* coverage: vision.page-translate.revert-all */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
  pickAreasAndTranslate,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    pageTranslateMode: 'bilingual',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('after settle, Show original toggles the view instead of destroying it', async () => {
  const timeline = createTimeline();
  mockAnthropic(ext.context, { translation: 'TRANSLATED' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);

  await pickAreasAndTranslate(ext, page, ['c1', 'c2']);
  timeline.markStep('translateAll-dispatched');

  await expect
    .poll(async () => (await egaTest<number>(page, 'pageV2TxCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);

  const actionButtonLabel = (): Promise<string> =>
    page.evaluate(() => {
      const host = document.getElementById('ega-shadow-host');
      const btn = host?.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-batch-cancel]');
      return btn ? btn.textContent.trim() : '';
    });
  const clickActionButton = (): Promise<void> =>
    page.evaluate(() => {
      const host = document.getElementById('ega-shadow-host');
      host?.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-batch-cancel]')?.click();
    });
  const allSiblingsHidden = (): Promise<boolean> =>
    page.evaluate(() => {
      const sibs = Array.from(document.querySelectorAll<HTMLElement>('[data-ega-tx]'));
      return sibs.length > 0 && sibs.every((el) => getComputedStyle(el).display === 'none');
    });

  // The batch settles shortly after the last block completes.
  await expect.poll(actionButtonLabel, { timeout: 10_000 }).toBe('Show original');

  await clickActionButton();
  timeline.markStep('show-original-clicked');

  // Translations are hidden, not destroyed — and the pill offers the way back.
  await expect.poll(allSiblingsHidden, { timeout: 5_000 }).toBe(true);
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(2);
  expect(await actionButtonLabel()).toBe('Show translation');

  await clickActionButton();
  timeline.markStep('show-translation-clicked');

  await expect.poll(allSiblingsHidden, { timeout: 5_000 }).toBe(false);
  expect(await actionButtonLabel()).toBe('Show original');

  // The original stays on the page throughout (bilingual leaves it untouched).
  expect(await egaTest<string>(page, 'inlineTextAt', 'c1')).toContain('mar7aba');
});
