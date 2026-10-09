import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
} from './helpers';

async function settledBounds(page: Page, width: number): Promise<void> {
  await expect
    .poll(async () => {
      const box = await page.locator('.tooltip').boundingBox();
      return !!box && box.x >= 8 && box.x + box.width <= width - 8 && box.y + box.height <= 800;
    })
    .toBe(true);
}

async function actionBounds(page: Page, width: number): Promise<void> {
  const buttons = page.locator('[data-ega-tooltip-actions]').getByRole('button');
  expect(await buttons.count()).toBeLessThanOrEqual(5);
  const bounds = await buttons.evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { center: box.top + box.height / 2, left: box.left, right: box.right };
    }),
  );
  const centers = bounds.map((box) => box.center);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  expect(bounds.every((box) => box.left >= 0 && box.right <= width)).toBe(true);
}

for (const theme of ['light', 'dark']) {
  for (const width of [400, 320, 256]) {
    test(`tooltip editors and partial error at ${width}px in ${theme}`, async ({
      browserName: _browserName,
    }, info) => {
      const ext = await launchExtension();
      try {
        await seedSettings(ext.context, ext.extensionId, {
          anthropicApiKey: 'test-key',
          streaming: true,
          shortcut: 'Ctrl+Shift+L',
          tooltipClickOutside: true,
          theme,
        });
        mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
        const bridge = await ext.context.newPage();
        await bridge.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
        const page = await ext.context.newPage();
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`${ext.serverUrl}/selection-page.html`);
        await waitForTestHooks(page);
        await selectArabiziParagraph(page);
        await page.keyboard.press('Control+Shift+L');
        await expect(page.getByRole('button', { name: 'Refine', exact: true })).toBeVisible();
        for (const [item, name] of [
          ['Describe a change…', 'change'],
          ['Translate into another language…', 'language'],
        ] as const) {
          await page.getByRole('button', { name: 'Refine', exact: true }).click();
          await page.getByRole('menuitem', { name: item, exact: true }).click();
          await expect(page.locator('.tooltip-editor')).toBeVisible();
          if (name === 'language') {
            const decoration = await page
              .getByLabel('Translate into', { exact: true })
              .evaluate((el) => {
                const style = getComputedStyle(el);
                return { repeat: style.backgroundRepeat, size: style.backgroundSize };
              });
            expect(decoration).toEqual({ repeat: 'no-repeat', size: '12px 12px' });
          }
          await settledBounds(page, width);
          await page.screenshot({ path: info.outputPath(`tooltip-${name}-${width}-${theme}.png`) });
          await actionBounds(page, width);
          await page.keyboard.press('Escape');
        }
        await ext.context.unroute('https://api.anthropic.com/v1/messages');
        mockAnthropic(ext.context, { translation: 'Late answer', delayMs: 5000 });
        await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
        await settledBounds(page, width);
        await page.screenshot({ path: info.outputPath(`tooltip-loading-${width}-${theme}.png`) });
        const requestId = await page
          .locator('[data-ega-tooltip-wrap]')
          .getAttribute('data-ega-tooltip-wrap');
        await bridge.evaluate(
          async ({ url, requestId }) => {
            const tab = (await chrome.tabs.query({ url: `${url}/*` })).find(
              (item) => item.id !== undefined,
            );
            if (tab?.id === undefined) throw new Error('Fixture tab missing');
            await chrome.tabs.sendMessage(tab.id, {
              kind: 'translate:chunk',
              chunk: { type: 'delta', requestId, text: '{"translation":"Partial answer' },
            });
            await chrome.tabs.sendMessage(tab.id, {
              kind: 'translate:chunk',
              chunk: {
                type: 'error',
                requestId,
                code: 'AUTH',
                message:
                  'Invalid test key. Replace the API key in Settings.\nHTTP 401: test credential rejected',
                backendId: 'anthropic',
              },
            });
          },
          { url: ext.serverUrl, requestId },
        );
        await expect(
          page.getByRole('button', { name: 'Open settings', exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('button', { name: 'Copy partial translation' })).toBeVisible();
        await settledBounds(page, width);
        await page.screenshot({
          path: info.outputPath(`tooltip-partial-error-${width}-${theme}.png`),
        });
        await actionBounds(page, width);
        await page.getByRole('button', { name: 'More', exact: true }).click();
        await page.getByRole('menuitemcheckbox', { name: 'Error details' }).click();
        await expect(page.locator('.tooltip-error-details')).toContainText('HTTP 401');
        await settledBounds(page, width);
        await page.screenshot({
          path: info.outputPath(`tooltip-error-details-${width}-${theme}.png`),
        });
      } finally {
        await ext.close();
      }
    });
  }
}
