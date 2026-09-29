/* coverage: translation.sidepanel.panel-scrolls-not-page */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
  resetRoutes,
} from '../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

// 400x640 is Chrome's default side-panel size — the width every user gets before resizing.
test('a long conversation scrolls inside the stream, and nothing leaves the panel', async () => {
  test.slow();
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 400, height: 640 });
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 10_000 });

  const longAnswer = 'This is a long translated answer that wraps over several lines. '.repeat(6);
  for (let i = 0; i < 4; i++) {
    await resetRoutes(ext.context);
    mockAnthropic(ext.context, { translation: `${longAnswer}#${i}`, times: 1 });
    await page.locator('#sp-text').fill(`marhaba ${i}`);
    await page.getByRole('button', { name: /^Translate$/ }).click();
    await expect(page.locator('.ega-assistant-turn')).toHaveCount(i + 1, { timeout: 20_000 });
  }

  const streamScrolls = await page.evaluate(() => {
    const el = document.querySelector('.ega-conv-stream');
    return el ? el.scrollHeight > el.clientHeight + 1 : false;
  });
  expect(streamScrolls, 'the conversation stream must own the scrollbar').toBe(true);

  // Anything painted outside the panel box is unreachable.
  const escaping = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      // A horizontally scrollable strip is meant to hold content past its own edge.
      let scrollableAncestor = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const pcs = getComputedStyle(p);
        if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') scrollableAncestor = true;
        if (pcs.overflowY === 'auto' || pcs.overflowY === 'scroll') scrollableAncestor = true;
      }
      if (scrollableAncestor) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right > vw + 0.5 || r.bottom > vh + 0.5 || r.left < -0.5) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
      }
    }
    return out;
  });
  expect(escaping, 'these paint outside the panel and cannot be reached').toEqual([]);
});
