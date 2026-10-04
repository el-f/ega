import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

// One narrow test per surface, to catch a shared-file change that only breaks the default path.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function seedAnthropic(): Promise<void> {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
}

test('popup launcher renders lang pickers + collapsed freeform composer', async () => {
  await seedAnthropic();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await expect(page.locator('#pop-lang')).toBeVisible();
  await expect(page.locator('#pop-target')).toBeVisible();
  await expect(page.locator('[data-ega-freeform-collapsed]')).toBeVisible();
  await expect(page.getByPlaceholder(/Paste or type/i)).toHaveCount(0);
  await page.locator('[data-ega-freeform-collapsed]').click();
  await expect(page.getByPlaceholder(/Paste or type/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Send to panel$/ })).toBeDisabled();
});

test('side panel: translate populates history + conversation', async () => {
  await seedAnthropic();
  mockAnthropic(ext.context, { translation: 'Hello, welcome!' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').fill('marhaba');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Hello', {
    timeout: 10_000,
  });
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1, { timeout: 5_000 });
});

test('selection bubble: click streams the tooltip on Arabizi selection', async () => {
  await seedAnthropic();
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  expect(await egaTest<boolean>(page, 'clickBubble')).toBe(true);
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');
});

test('picker hotkey: Ctrl+Shift+E then click produces a tooltip', async () => {
  await seedAnthropic();
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/picker-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await page.keyboard.press('Control+Shift+E');
  await expect
    .poll(async () => (await egaTest<boolean>(page, 'pickerIsActive')) ?? false, { timeout: 3_000 })
    .toBe(true);
  await page.locator('#pick-me').click();
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');
});

test('options: every tab renders without error', async () => {
  const page = await ext.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  // Read the tab list from the nav so renaming or adding a tab cannot rot this spec.
  const tabButtons = page.getByRole('tab');
  const count = await tabButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await tabButtons.nth(i).click();
    // `.first()` is required: the Advanced tab nests a second tabpanel, which trips strict mode.
    await expect(page.locator('[role="tabpanel"]').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('options theme toggle flips html[data-theme] through light/dark/system', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('[data-ega-theme="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('[data-ega-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-ega-theme="system"]').click();
  // System mode drops the attribute; tokens fall back to prefers-color-scheme.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
});

test('popup swap button flips the source/target language pickers', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    defaultLang: 'en',
    defaultTargetLang: 'es',
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  const src = page.locator('#pop-lang');
  const tgt = page.locator('#pop-target');
  await expect(src).toHaveValue('en');
  await expect(tgt).toHaveValue('es');
  await page.getByRole('button', { name: 'Swap languages' }).click();
  await expect(src).toHaveValue('es');
  await expect(tgt).toHaveValue('en');
});
