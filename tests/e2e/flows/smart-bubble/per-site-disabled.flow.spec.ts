/* coverage: translation.smart-bubble.per-site-disabled */
import { test } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertStaysStable } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('site marked disabled in sitePrefs -> smart bubble does NOT mount', async () => {
  const origin = ext.serverUrl; // http://127.0.0.1:<port> — matches location.origin
  await seedSettings(ext.context, ext.extensionId, {
    bubbleMode: 'smart',
    sitePrefs: { [origin]: { disabled: true } },
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await page.evaluate(() => {
    const el = document.getElementById('arabizi');
    if (!el) throw new Error('arabizi paragraph missing');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no window.getSelection()');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });

  // Sampling across a window, not one read: it also catches a bubble that mounts and settles back.
  await assertStaysStable(
    async () =>
      await page.evaluate(() => {
        const host = document.querySelector('#ega-shadow-host');
        const root = (host as HTMLElement | null)?.shadowRoot;
        return root?.querySelector('[data-ega-bubble-wrap]') != null;
      }),
    false,
    { windowMs: 2_000, message: 'disabled-site bubble must never mount' },
  );
});
