import { test, expect, type Page } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from './helpers';
import type { Settings } from '../../src/shared/types';

// Mount-smoke for every Options tab except Backends, which has its own spec.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function openOptions(): Promise<{ page: Page; errors: string[] }> {
  const errors: string[] = [];
  const page = await ext.context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // Filter benign DevTools noise.
      if (!/devtools|Extensions/i.test(t)) errors.push(t);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  return { page, errors };
}

test('Selection tab: mounts and toggling bubbleMode persists', async () => {
  const { page, errors } = await openOptions();
  await page.getByRole('tab', { name: /^Selection and picker$/ }).click();

  const alwaysRadio = page.locator('[data-ega-bubble-mode] label').filter({ hasText: /Always/ });
  await expect(alwaysRadio).toBeVisible();
  await alwaysRadio.click();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.bubbleMode;
      },
      { timeout: 5_000 },
    )
    .toBe('always');

  expect(errors).toEqual([]);
});

test('Languages tab: mounts without errors and shows enable-arabizi control', async () => {
  const { page, errors } = await openOptions();
  await page.getByRole('tab', { name: /^Languages$/ }).click();

  await expect(page.locator('#enable-arabizi')).toBeVisible({ timeout: 5_000 });

  // The add-language form sits behind a header toggle, so open it before asserting.
  await page.getByRole('button', { name: /add custom language/i }).click();
  await expect(page.locator('.add-form').getByLabel(/^Label/)).toBeVisible();
  await expect(page.locator('#new-hint')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Translate tab: temperature slider thumb is focusable + keyboard-driven', async () => {
  // The slider shows only when the backend that runs takes temperature; a key puts Anthropic there.
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-ant-test',
    advanced: { temperature: 0.2, maxTokens: 2048 },
  });
  const { page, errors } = await openOptions();
  await page.getByRole('tab', { name: /^Answers$/ }).click();

  const tempRow = page.locator('[data-ega-setting="advanced.temperature"]');
  await expect(tempRow).toBeVisible({ timeout: 5_000 });

  // bits-ui exposes a thumb with role="slider", not a native range input.
  const thumb = tempRow.getByRole('slider');
  await thumb.focus();
  const before =
    (await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings'))?.advanced
      .temperature ?? 0;
  await page.keyboard.press('ArrowRight');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.temperature ?? before) > before;
      },
      { timeout: 5_000 },
    )
    .toBe(true);

  expect(errors).toEqual([]);
});

// The Privacy SectionCard renders inside the About panel, so the About test covers it.

test('About tab: mounts without errors and shows the version line', async () => {
  const { page, errors } = await openOptions();
  await page.getByRole('tab', { name: /^About$/ }).click();

  const panel = page.locator('#tabpanel-about');
  await expect(panel).toBeVisible({ timeout: 5_000 });
  // Do not pin the version string — it changes every release.
  await expect(panel).not.toBeEmpty();

  expect(errors).toEqual([]);
});
