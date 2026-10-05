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

test('Stop keeps the finished area, then Undo all puts the page back', async () => {
  // One reply lands; the others wait, so Stop catches the batch mid-way.
  let release = (): void => {};
  const held = new Promise<void>((r) => (release = r));
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await held;
    await route.abort().catch(() => {});
  });
  mockAnthropic(ext.context, { translation: 'TRANSLATED', times: 1 });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  await pickAreasAndTranslate(ext, page, ['c1', 'c2', 'c4']);

  const pill = page.locator('[data-ega-batch-progress]');
  await expect(pill.locator('[data-ega-batch-label]')).toHaveText('Translating 1 of 3 areas…', {
    timeout: 10_000,
  });

  await pill.locator('[data-ega-batch-cancel]').click();

  await expect(pill.locator('[data-ega-batch-label]')).toHaveText(
    'Stopped · 1 of 3 areas translated',
  );
  await expect(pill.locator('[data-ega-batch-cancel]')).toHaveText('Show original');
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(1);

  await pill.locator('.undo').click();

  await expect(pill).toHaveCount(0);
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(0);
  release();
});
