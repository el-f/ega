/* coverage: translation.sidepanel.regenerate-skips-cache */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
    // The default; set here because the bug only shows with the cache on.
    cacheEnabled: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Regenerate on a finished answer asks the model again instead of replaying the cached answer', async () => {
  const timeline = createTimeline();
  const first = mockAnthropic(ext.context, { translation: 'First answer.', times: 1 });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  const turn = page.locator('.ega-assistant-turn');
  await expect(turn.locator('.ega-assistant-body')).toContainText('First answer.', {
    timeout: 10_000,
  });
  expect(first.calls()).toBe(1);
  timeline.markStep('first-answer');

  // Registered later, so it answers the next call; the first mock is spent.
  const second = mockAnthropic(ext.context, { translation: 'Second answer.' });
  await turn.hover();
  await turn.getByRole('button', { name: 'Regenerate', exact: true }).click();
  timeline.markStep('regenerate-clicked');

  await expect(page.locator('[data-ega-variant-nav] .ega-variant-counter')).toHaveText('2/2', {
    timeout: 10_000,
  });
  await expect(turn.locator('.ega-assistant-body')).toContainText('Second answer.', {
    timeout: 10_000,
  });
  // The same request is in the cache, so only a skipped cache reaches the model a second time.
  expect(second.calls()).toBe(1);
  timeline.markStep('second-answer');
});
