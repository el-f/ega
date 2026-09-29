/* coverage: options.backends.enable-disable */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  onlyBackends,
  readStorage,
  seedSettings,
  type ExtensionHandle,
} from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { asBackendIdUnsafe } from '../../../../src/shared/brands';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('disabledBackends storage drives active/available split on render', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic'),
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  await expect(page.getByTestId('be-list-active').getByTestId('be-row-anthropic')).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId('be-list-active').locator('[data-testid^="be-row-"]')).toHaveCount(
    1,
  );
  await expect(page.getByTestId('be-list-available').getByTestId('be-row-openai')).toBeVisible();

  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('openai'),
  });
  await page.reload();
  await page.locator('#tab-backends').click();
  await expect(page.getByTestId('be-list-active').getByTestId('be-row-openai')).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId('be-list-available').getByTestId('be-row-anthropic')).toBeVisible();

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.disabledBackends ?? []).toContain(asBackendIdUnsafe('anthropic'));
  expect(s?.disabledBackends ?? []).not.toContain(asBackendIdUnsafe('openai'));
});
