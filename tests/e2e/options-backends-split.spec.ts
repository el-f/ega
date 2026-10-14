import { test, expect, type Page } from '@playwright/test';
import { launchExtension, onlyBackends, seedSettings, type ExtensionHandle } from './helpers';

// A layout check of the Backends tab, not a user journey, so it stays outside tests/e2e/flows/.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function openBackends(): Promise<Page> {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('[data-tooltip="Backends"]').click();
  await expect(page.locator('[data-testid="be-list"]')).toBeVisible({ timeout: 5_000 });
  return page;
}

test('Backends renders Active + Available section headings', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic', 'native'),
  });
  const page = await openBackends();

  await expect(page.getByRole('heading', { name: /^Backends in use$/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Not in use$/ })).toBeVisible();

  await expect(page.getByText(/^DISABLED$/)).toHaveCount(0);
});

test('Active zone holds enabled rows; Available zone holds disabled rows', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic', 'native'),
  });
  const page = await openBackends();

  const active = page.locator('[data-testid="be-list-active"]');
  const available = page.locator('[data-testid="be-list-available"]');

  await expect(active.locator('[data-testid="be-row-anthropic"]')).toBeVisible();
  await expect(active.locator('[data-testid="be-row-native"]')).toBeVisible();

  for (const id of ['openai', 'gemini', 'groq', 'deepseek', 'ollama'] as const) {
    await expect(available.locator(`[data-testid="be-row-${id}"]`)).toBeVisible();
  }

  await expect(active.locator('[data-testid="be-row-openai"]')).toHaveCount(0);
  await expect(available.locator('[data-testid="be-row-anthropic"]')).toHaveCount(0);
});

test('Active list ARIA reflects the new labeling', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic'),
  });
  const page = await openBackends();

  const active = page.locator('[data-testid="be-list-active"]');
  await expect(active).toHaveAttribute('aria-label', /Backends in use/);
  const available = page.locator('[data-testid="be-list-available"]');
  await expect(available).toHaveAttribute('aria-label', /Backends not in use/);
});
