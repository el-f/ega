import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;
test.afterEach(async () => {
  await ext.close();
});

async function open(
  width = 400,
  theme = 'light',
): Promise<{ page: Page; mock: ReturnType<typeof mockAnthropic> }> {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: true,
    captureResultMeta: true,
    defaultLang: 'fr',
    defaultTargetLang: 'en',
    theme,
  });
  const mock = mockAnthropic(ext.context, {
    translation: 'Welcome, how are you?',
    confidence: 0.4,
  });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await expect(page.locator('.tooltip .body')).toContainText('Welcome');
  await expect(page.getByRole('button', { name: 'Regenerate', exact: true })).toBeVisible();
  return { page, mock };
}

for (const theme of ['light', 'dark']) {
  for (const width of [400, 320, 256]) {
    test(`tooltip layout and menus at ${width}px in ${theme}`, async ({
      browserName: _browserName,
    }, info) => {
      const { page } = await open(width, theme);
      const row = page.locator('[data-ega-tooltip-actions]');
      await expect(row.getByRole('button')).toHaveCount(5);
      const rects = await row.getByRole('button').evaluateAll((buttons) =>
        buttons.map((b) => {
          const r = b.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right };
        }),
      );
      expect(new Set(rects.map((r) => Math.round(r.top))).size).toBe(1);
      expect(rects.every((r) => r.left >= 0 && r.right <= width)).toBe(true);
      await expect(page.locator('[data-ega-reply-meta]')).toContainText('Low confidence (40%)');
      await page.screenshot({ path: info.outputPath(`tooltip-${width}-${theme}.png`) });

      const more = page.getByRole('button', { name: 'More', exact: true });
      await more.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitemcheckbox', { name: 'About this reply' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(more).toBeFocused();
      await expect(page.locator('.tooltip')).toBeVisible();
      await more.click();
      await page.getByRole('menuitemcheckbox', { name: 'About this reply' }).click();
      await expect(page.locator('[data-ega-inspector]')).toBeVisible();
      const aboutBox = await page.locator('.tooltip').boundingBox();
      if (!aboutBox) throw new Error('No tooltip bounds');
      expect(aboutBox.y + aboutBox.height).toBeLessThanOrEqual(800);
      await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(1);
      await page.screenshot({ path: info.outputPath(`tooltip-about-${width}-${theme}.png`) });
      await page.getByRole('button', { name: 'Refine', exact: true }).click();
      await expect(page.getByRole('menuitem', { name: 'Shorter', exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`tooltip-refine-${width}-${theme}.png`) });
    });
  }
}

test('Regenerate bypasses the saved answer and Refine sends a per-request change', async () => {
  const { page, mock } = await open();
  const before = mock.calls();
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect.poll(() => mock.calls()).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Refine', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Shorter', exact: true }).click();
  await expect.poll(() => mock.lastRequestBody()).toContain('Make outputs shorter.');
  await expect(page.locator('.tooltip .body')).toContainText('Welcome');
  await expect(page.locator('[data-ega-diff]')).toHaveCount(0);
});

test('Stop keeps keyboard focus on the retained reply recovery action', async () => {
  const { page } = await open(256, 'dark');
  await ext.context.unroute('https://api.anthropic.com/v1/messages');
  mockAnthropic(ext.context, { translation: 'Late answer', delayMs: 2000 });
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeFocused();
  await expect(page.locator('[data-ega-tooltip-live]')).toContainText('Stopped. No answer yet.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tooltip')).toHaveCount(0);
});

test('Describe a change and another language apply through the Refine editor', async () => {
  const { page, mock } = await open(256);
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Describe a change…', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Describe a change', exact: true })
    .fill('Use two short sentences.');
  const beforeChange = mock.calls();
  // requestSubmit() creates a trusted SubmitEvent even when a hostile page calls it.
  await page
    .locator('.tooltip-editor form')
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page.getByRole('textbox', { name: 'Describe a change', exact: true })).toBeVisible();
  expect(mock.calls()).toBe(beforeChange);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => mock.calls()).toBeGreaterThan(beforeChange);
  await expect.poll(() => mock.lastRequestBody()).toContain('Use two short sentences.');
  await expect(page.getByRole('button', { name: 'Refine', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Translate into another language…', exact: true })
    .click();
  await expect(page.getByRole('group', { name: 'Translate into another language' })).toBeVisible();
  await page.getByLabel('Translate into', { exact: true }).selectOption({ label: 'Spanish' });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => mock.lastRequestBody()).toContain('Spanish');
  await expect(page.locator('[data-ega-meta-item="direction"]')).toContainText('Spanish');
});
