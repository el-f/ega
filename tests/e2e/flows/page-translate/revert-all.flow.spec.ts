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
  timeline.markStep('areas-sent');

  await expect
    .poll(async () => (await egaTest<number>(page, 'pageV2TxCount')) ?? 0, { timeout: 10_000 })
    .toBe(2);

  const pill = page.locator('[data-ega-batch-progress]');
  const original = pill.getByRole('button', { name: 'Show original' });
  const allSiblingsHidden = (): Promise<boolean> =>
    page.evaluate(() => {
      const sibs = Array.from(document.querySelectorAll<HTMLElement>('[data-ega-tx]'));
      return sibs.length > 0 && sibs.every((el) => getComputedStyle(el).display === 'none');
    });

  // The batch settles shortly after the last block completes.
  await expect(original).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });

  await original.click();
  timeline.markStep('show-original-clicked');

  // Translations are hidden, not destroyed; the same button, pressed, is the way back.
  await expect.poll(allSiblingsHidden, { timeout: 5_000 }).toBe(true);
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(2);
  await expect(original).toHaveAttribute('aria-pressed', 'true');

  await original.click();
  timeline.markStep('show-translation-clicked');

  await expect.poll(allSiblingsHidden, { timeout: 5_000 }).toBe(false);
  await expect(original).toHaveAttribute('aria-pressed', 'false');

  // The original stays on the page throughout (bilingual leaves it untouched).
  expect(await egaTest<string>(page, 'inlineTextAt', 'c1')).toContain('mar7aba');
});

test('Stop lets the areas in flight end, then Remove translation puts the page back', async () => {
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

  await pill.getByRole('button', { name: 'Stop' }).click();
  // The two held requests end in a network failure; a retry is a new start, so Stop puts those areas back.
  release();

  await expect(pill.locator('[data-ega-batch-label]')).toHaveText(
    'Stopped. Translated 1 of 3 areas.',
    { timeout: 10_000 },
  );
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(1);

  await pill.getByRole('button', { name: 'More' }).click();
  await pill.getByRole('menuitem', { name: 'Remove translation' }).click();

  await expect(pill).toHaveCount(0);
  expect((await egaTest<number>(page, 'pageV2TxCount')) ?? 0).toBe(0);
});
