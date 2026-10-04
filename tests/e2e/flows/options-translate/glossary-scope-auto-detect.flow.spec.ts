/* coverage: options.translate.glossary-scope-auto-detect */
import { test, expect, type Page } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    defaultLang: 'auto',
    defaultTargetLang: 'en',
  });
});

test.afterEach(async () => {
  await ext.close();
});

async function addEntry(
  page: Page,
  term: string,
  translation: string,
  sourceScope: string,
): Promise<void> {
  await page.getByLabel('Term').fill(term);
  await page.getByLabel('Translation').fill(translation);
  await page.locator('select[aria-label="Source language scope"]').selectOption(sourceScope);
  await page.locator('button.ega-btn.variant-primary', { hasText: 'Add entry' }).click();
  await expect(page.getByLabel('Term')).toHaveValue('', { timeout: 5_000 });
}

test('the scope help explains the Auto-detect rule the picker offers, and the rule holds', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, { translation: 'ok' });

  const options = await ext.context.newPage();
  await options.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await options.locator('#tab-glossary').click();

  const help = options.locator('[data-ega-glossary-scope-help]');
  await expect(help).toBeVisible({ timeout: 5_000 });
  await expect(help).toContainText('Auto-detect');
  timeline.markStep('scope-help-visible');

  // The help says the state exists, so the picker has to be able to express it.
  const sourceScope = options.locator('select[aria-label="Source language scope"]');
  await expect(sourceScope.locator('option[value="auto"]')).toHaveText('Auto-detect');

  await addEntry(options, 'wallet', 'cartera', 'auto');
  await addEntry(options, 'ledger', 'libro mayor', 'es');
  timeline.markStep('entries-added');
  await options.close();

  const panel = await ext.context.newPage();
  await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await panel.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await panel.locator('#sp-text').fill('the wallet and the ledger');
  await panel.getByRole('button', { name: /^Translate$/ }).click();
  await expect(panel.locator('.ega-assistant-body').first()).toContainText('ok', {
    timeout: 10_000,
  });
  timeline.markStep('request-sent');

  const body = mock.lastRequestBody() ?? '';
  expect(body).toContain('cartera');
  // Scoped to Spanish while the request source is Auto-detect — exactly what the help warns about.
  expect(body).not.toContain('libro mayor');
});
