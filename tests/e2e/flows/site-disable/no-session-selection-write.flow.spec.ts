/* coverage: translation.site-disable.no-session-selection-write */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

const SELECTION_KEY = 'ega.lastSelection';

let ext: ExtensionHandle;

async function readSessionSelection(): Promise<unknown> {
  const page = await ext.context.newPage();
  try {
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    return await page.evaluate(async (k) => {
      const r = await chrome.storage.session.get(k);
      return r[k] ?? null;
    }, SELECTION_KEY);
  } finally {
    await page.close();
  }
}

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('selecting text on a disabled site writes nothing to the popup selection cache', async () => {
  const timeline = createTimeline();
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: { [ext.serverUrl]: { disabled: true } },
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);
  timeline.markStep('selected');

  // The cache write is on a 100 ms timer, so one read after the gate would pass either way.
  await assertStaysStable(readSessionSelection, null, {
    windowMs: 2_000,
    intervalMs: 250,
    message: 'a disabled site must not park the selection for the popup',
  });
  timeline.markStep('cache-empty');
});

test('the same selection on an enabled site does reach the cache', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);

  await expect
    .poll(async () => ((await readSessionSelection()) as { text?: string } | null)?.text ?? null, {
      timeout: 5_000,
    })
    .not.toBeNull();
});
