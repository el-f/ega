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
  await pill.locator('[data-ega-batch-cancel]').click();
  await expect.poll(() => label(page)).toMatch(/^Stopped\. Translated \d+ of 60 areas\.$/);
  const kept = mock.calls();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500); // proves a negative: no new request after Stop and a scroll
  expect(mock.calls()).toBe(kept);
  timeline.markStep('stopped');

  await pill.locator('[data-ega-batch-more]').click();
  await pill.locator('[data-ega-batch-remove]').click();
  await expect(pill).toHaveCount(0);
  expect((await egaTest<number>(page, 'inlineCount')) ?? 0).toBe(0);
});

test('closed scrolling drawers do not leave Translate page waiting forever', async () => {
  const mock = mockAnthropic(ext.context, { translation: 'TRANSLATED', detectedLang: 'es' });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(`${ext.serverUrl}/long-page.html`);
  await waitForTestHooks(page);
  await page.evaluate(() => {
    document.body.innerHTML = `
      <p id="visible">Este párrafo está visible y se puede traducir.</p>
      <aside id="left" style="position:fixed;left:0;top:0;width:300px;height:100vh;transform:translateX(-100%);overflow-y:auto">
        <p id="closed-left">Este menú cerrado no se puede alcanzar.</p>
      </aside>
      <aside id="right" style="position:fixed;left:100%;top:0;width:300px;height:100vh;overflow-y:auto">
        <p id="closed-right">Este otro menú cerrado tampoco se puede alcanzar.</p>
      </aside>`;
    document.body.style.overflowX = 'hidden';
  });
  // Chromium computes overflow-x:auto for these vertical scrollers. Their own boxes remain off-screen.
  expect(await page.locator('#left').evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
  await translatePage();
  await expect.poll(() => label(page), { timeout: 10_000 }).toBe('Page translated to English');
  expect(mock.calls()).toBe(1);
  await expect(page.locator('#closed-left')).toHaveText('Este menú cerrado no se puede alcanzar.');
  await expect(page.locator('#closed-right')).toHaveText(
    'Este otro menú cerrado tampoco se puede alcanzar.',
  );
});

test('an app pane and a wide table stay reachable through their scrolling containers', async () => {
  const mock = mockAnthropic(ext.context, { translation: 'TRANSLATED', detectedLang: 'es' });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(`${ext.serverUrl}/long-page.html`);
  await waitForTestHooks(page);
  await page.evaluate(() => {
    document.documentElement.style.cssText = 'height:100%;overflow:hidden';
    document.body.style.cssText = 'height:100%;margin:0;overflow:hidden';
    document.body.innerHTML = `
      <main id="app" style="height:100vh;overflow-y:auto">
        <p id="first">Este primer párrafo está visible.</p>
        <div style="height:2500px"></div>
        <p id="last">Este párrafo está al final del panel.</p>
        <div id="table-scroll" style="overflow-x:auto">
          <table style="width:2400px;table-layout:fixed"><tr>
            <td style="width:2000px"></td><td id="cell">Esta columna queda a la derecha.</td>
          </tr></table>
        </div>
      </main>`;
  });
  await translatePage();
  await expect.poll(() => label(page), { timeout: 10_000 }).toMatch(/of 3 areas translated/);
  await page.locator('#app').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.locator('#table-scroll').evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect.poll(() => label(page), { timeout: 10_000 }).toBe('Page translated to English');
  expect(mock.calls()).toBe(3);
});
