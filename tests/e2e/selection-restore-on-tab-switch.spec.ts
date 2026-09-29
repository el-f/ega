import { test, expect } from '@playwright/test';
import { launchExtension, waitForTestHooks, type ExtensionHandle } from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

// page.bringToFront() does not reproduce Chrome's real event order, so drive it by hand.
test('selection restored when clear-after-visibility-return sequence fires', async () => {
  const pageA = await ext.context.newPage();
  await pageA.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(pageA);

  await pageA.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'restore-target-2';
    p.textContent = 'yarayt rase fade add rasak';
    document.body.appendChild(p);
  });

  await pageA.evaluate(() => {
    const el = document.getElementById('restore-target-2');
    if (!el) throw new Error('restore-target-2 missing');
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection API');
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });

  // Chrome's real order: visibilitychange, then a selectionchange that clears the range.
  await pageA.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection API');
    sel.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
  });

  await expect
    .poll(
      async () => (await pageA.evaluate(() => window.getSelection()?.toString() ?? '')).trim(),
      { timeout: 2_000 },
    )
    .toBe('yarayt rase fade add rasak');
});
