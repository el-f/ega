/* coverage: translation.site-disable.no-session-selection-write */
import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { assertStaysStable, createTimeline } from '../_harness';

const OLD_SELECTION_KEY = 'ega.lastSelection';

let ext: ExtensionHandle;

async function onExtensionPage<T>(run: (page: Page) => Promise<T>): Promise<T> {
  const page = await ext.context.newPage();
  try {
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    return await run(page);
  } finally {
    await page.close();
  }
}

/** What the popup would prefill, asked the way the popup asks: a message to the tab's content script. */
function popupSelection(): Promise<string | null> {
  return onExtensionPage((page) =>
    page.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url: `${url}/*` });
      const target = tabs.find((t) => typeof t.id === 'number');
      if (target?.id === undefined) return null;
      const reply = (await chrome.tabs.sendMessage(target.id, { kind: 'ega:get-selection' })) as {
        text?: string;
      };
      return reply.text ?? null;
    }, ext.serverUrl),
  );
}

function storedSelection(): Promise<unknown> {
  return onExtensionPage((page) =>
    page.evaluate(async (k) => {
      const r = await chrome.storage.session.get(k);
      return r[k] ?? null;
    }, OLD_SELECTION_KEY),
  );
}

/** Opening the popup drops the live selection. The wait lets the page remember the old one first:
 *  a newer selectionchange cancels a remember still waiting on settings. */
async function dropLiveSelection(page: Page): Promise<void> {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
}

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('selecting text on a disabled site leaves nothing for the popup', async () => {
  const timeline = createTimeline();
  await seedSettings(ext.context, ext.extensionId, {
    sitePrefs: { [ext.serverUrl]: { disabled: true } },
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);
  timeline.markStep('selected');
  await dropLiveSelection(page);

  // The page remembers a selection a moment after it changes, so one read right away proves nothing.
  await assertStaysStable(popupSelection, '', {
    windowMs: 2_000,
    intervalMs: 250,
    message: 'a disabled site must not hand the popup the selection',
  });
  expect(await storedSelection()).toBeNull();
  timeline.markStep('nothing-kept');
});

test('on an enabled site the popup still gets a selection the page dropped, and nothing is stored', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);
  await dropLiveSelection(page);

  await expect.poll(async () => (await popupSelection()) ?? '', { timeout: 5_000 }).not.toBe('');
  // The selection stays in the page; no other site's content script can read it from storage.
  expect(await storedSelection()).toBeNull();
});
