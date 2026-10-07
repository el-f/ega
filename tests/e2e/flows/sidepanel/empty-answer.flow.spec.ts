/* coverage: translation.sidepanel.empty-answer */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('a reply that comes back empty says so instead of rendering a blank turn', async () => {
  const timeline = createTimeline();
  // The model answers with a well-formed body whose translation is empty — no error, no content.
  mockAnthropic(ext.context, { translation: '' });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola');
  await page.locator('#sp-text').press('Enter');
  timeline.markStep('send-clicked');

  const empty = page.locator('[data-ega-empty-body]');
  await expect(empty).toBeVisible({ timeout: 10_000 });
  await expect(empty).toContainText('No answer came back');
  timeline.markStep('empty-body-visible');

  // It is a finished turn, not an error and not a stuck stream.
  await expect(page.locator('[data-ega-reply]')).toHaveCount(1);
  await expect(page.locator('[data-ega-error]')).toHaveCount(0);
  await expect(page.locator('.ega-skeleton')).toHaveCount(0);

  // The text points at Regenerate, so Regenerate has to be there.
  await expect(
    page.locator('[data-ega-reply]').getByRole('button', { name: 'Regenerate', exact: true }),
  ).toBeVisible();
});

test('a reply with text renders no empty-answer notice', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola');
  await page.locator('#sp-text').press('Enter');

  await expect(page.locator('.ega-answer').first()).toContainText('Welcome', {
    timeout: 10_000,
  });
  await expect(page.locator('[data-ega-empty-body]')).toHaveCount(0);
});
