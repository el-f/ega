import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  onlyBackends,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';
import { SETTINGS_TABS } from '../../src/shared/settings-tabs';

let ext: ExtensionHandle;
test.afterEach(async () => {
  await ext.close();
});

async function checkHoverLayout(page: Page, scope = 'body'): Promise<void> {
  const targets = page.locator(`${scope} [data-tooltip]:not([data-tooltip=''])`);
  for (const target of await targets.all()) {
    if (!(await target.isVisible())) continue;
    await target.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const snapshot = async () => ({
      document: await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body.getBoundingClientRect();
        const shell = document.querySelector('[data-ega-app-shell]')?.getBoundingClientRect();
        return {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          scrollHeight: root.scrollHeight,
          bodyWidth: body.width,
          bodyHeight: body.height,
          shellWidth: shell?.width,
          shellHeight: shell?.height,
        };
      }),
      tooltips: await page.locator('.tooltip').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      ),
    });
    const before = await snapshot();
    const name = await target.getAttribute('data-tooltip');
    for (let i = 0; i < 2; i++) {
      await target.hover();
      await page.evaluate(
        () =>
          new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      );
      expect(await snapshot(), `${name}: hover preserves layout`).toEqual(before);
      await page.mouse.move(0, 0);
      expect(await snapshot(), `${name}: leaving preserves layout`).toEqual(before);
    }
    await target.focus();
    expect(await snapshot(), `${name}: keyboard label preserves layout`).toEqual(before);
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`hover and focus labels preserve popup and side panel layout (${theme})`, async () => {
    test.setTimeout(90_000);
    ext = await launchExtension();
    await seedSettings(ext.context, ext.extensionId, {
      ...onlyBackends('gemini'),
      geminiApiKey: 'test-key',
      theme,
    });
    const popup = await ext.context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.emulateMedia({ reducedMotion: 'reduce' });
    await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
    await expect(popup.locator('.popup-body')).not.toHaveClass(/pending/);
    await checkHoverLayout(popup);
    await popup.close();

    const panel = await ext.context.newPage();
    await panel.emulateMedia({ reducedMotion: 'reduce' });
    await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
    await expect(panel.locator('[data-ega-sidepanel-empty]')).toBeVisible();
    for (const width of [256, 320, 400]) {
      await panel.setViewportSize({ width, height: 800 });
      await checkHoverLayout(panel);
    }
  });

  test(`hover and focus labels preserve Options layout (${theme})`, async () => {
    test.setTimeout(120_000);
    ext = await launchExtension();
    await seedSettings(ext.context, ext.extensionId, {
      anthropicApiKey: 'test-key',
      onboardingDismissed: true,
      theme,
    });
    const page = await ext.context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    for (const width of [600, 1200]) {
      await page.setViewportSize({ width, height: 800 });
      for (const tab of SETTINGS_TABS) {
        await page.locator(`#tab-${tab.id}`).click();
        await expect(page.locator(`#tabpanel-${tab.id}`)).toBeVisible();
        await checkHoverLayout(page, `#tabpanel-${tab.id}`);
      }
    }
  });

  test(`hover and focus labels preserve the translation tooltip position (${theme})`, async () => {
    test.setTimeout(60_000);
    ext = await launchExtension();
    await seedSettings(ext.context, ext.extensionId, {
      ...onlyBackends('anthropic'),
      anthropicApiKey: 'test-key',
      theme,
      shortcut: 'Ctrl+Shift+L',
      tooltipClickOutside: false,
    });
    mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
    const page = await ext.context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${ext.serverUrl}/selection-page.html`);
    await waitForTestHooks(page);
    await page.locator('body').focus();
    await selectArabiziParagraph(page);
    await page.keyboard.press('Control+Shift+L');
    await expect(page.locator('.tooltip .body')).toContainText('Welcome');
    await checkHoverLayout(page, '.tooltip');
  });
}
