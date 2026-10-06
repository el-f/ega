/* coverage: vision.page-translate.whole-page-lazy */
import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  onlyBackends,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    ...onlyBackends('anthropic'),
    pageTranslateMode: 'inplace',
  });
});

test.afterEach(async () => {
  await ext.close();
});

async function translatePage(): Promise<void> {
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('[e2e] no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'page:translateAll' });
  });
}

function label(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      document
        .getElementById('ega-shadow-host')
        ?.shadowRoot?.querySelector('[data-ega-batch-label]')
        ?.textContent.trim() ?? '',
  );
}

test('Translate page sends the blocks near the viewport first, and the rest as the user scrolls', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, {
    translation: 'TRANSLATED',
    detectedLang: 'es',
    confidence: 0.9,
  });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(`${ext.serverUrl}/long-page.html`);
  await waitForTestHooks(page);

  await translatePage();
  // 60 blocks of about 284px: the viewport plus one screen below holds about six.
  await expect
    .poll(() => label(page), { timeout: 10_000 })
    .toMatch(/The rest translate as you scroll/);
  const firstWave = mock.calls();
  expect(firstWave).toBeGreaterThan(0);
  expect(firstWave).toBeLessThanOrEqual(8);
  expect(await label(page)).toMatch(/^\d+ of 60 areas translated\./);
  timeline.markStep('first-wave');

  // Scroll halfway: the blocks near the new viewport start; the ones skipped over do not.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBeGreaterThan(firstWave);
  await expect
    .poll(() => label(page), { timeout: 10_000 })
    .toMatch(/The rest translate as you scroll/);
  expect(mock.calls()).toBeLessThan(25);
  expect(await egaTest<string>(page, 'inlineTextAt', 'b20')).not.toContain('TRANSLATED');
  timeline.markStep('scrolled');

  // Stop drops what is still waiting and keeps what finished.
  const pill = page.locator('[data-ega-batch-progress]');
  await pill.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => label(page)).toMatch(/^Stopped\. Translated \d+ of 60 areas\.$/);
  const kept = mock.calls();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500); // proves a negative: no new request after Stop and a scroll
  expect(mock.calls()).toBe(kept);
  timeline.markStep('stopped');

  await pill.getByRole('button', { name: 'More' }).click();
  await pill.getByRole('menuitem', { name: 'Remove translation' }).click();
  await expect(pill).toHaveCount(0);
  expect((await egaTest<number>(page, 'inlineCount')) ?? 0).toBe(0);
});
