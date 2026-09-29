/* coverage: options.command-palette.keyboard-run */
import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from '../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Ctrl+K palette: focus in the query, arrows move, Home stays in the field, Enter runs', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.waitForLoadState('networkidle');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  const input = page.getByRole('combobox', { name: 'Command palette' });
  await expect(input).toBeFocused({ timeout: 5_000 });

  await input.fill('theme');
  const options = page.getByRole('listbox', { name: 'Command results' }).getByRole('option');
  await expect(options.nth(1)).toBeVisible();
  const firstId = await options.nth(0).getAttribute('id');
  const secondId = await options.nth(1).getAttribute('id');
  await expect(input).toHaveAttribute('aria-activedescendant', firstId ?? '');

  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', secondId ?? '');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Home');
  await expect(input).toHaveAttribute('aria-activedescendant', secondId ?? '');
  expect(await input.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(0);

  await page.keyboard.press('ArrowUp');
  await expect(input).toHaveAttribute('aria-activedescendant', firstId ?? '');

  await input.fill('switch theme: dark');
  await expect(options.first()).toHaveText(/Switch theme: dark/);
  await page.keyboard.press('Enter');

  await expect(input).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
