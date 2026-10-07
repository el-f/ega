/* coverage: translation.sidepanel.refine-preset */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  newestReply,
  openReplyMenu,
  readStorage,
  seedSettings,
  sendFromPanel,
  type ExtensionHandle,
} from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('the Shorter preset adds a version and sends the refinement once, without saving it', async () => {
  const timeline = createTimeline();
  const route = mockAnthropic(ext.context, { translation: 'Hello.' });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(page, 'hola amigo');
  await expect(page.locator('.ega-answer').first()).toContainText('Hello', {
    timeout: 10_000,
  });
  timeline.markStep('first-turn-done');

  const menu = await openReplyMenu(page, 'refine');
  const shorter = menu.locator('[data-ega-refine-preset="shorter"]');
  await expect(shorter).toHaveText('Shorter');
  timeline.markStep('menu-open');

  await shorter.click();
  timeline.markStep('preset-picked');
  await expect(menu).toHaveCount(0);

  const reply = newestReply(page);
  await expect(reply.locator('.ega-pager-count')).toHaveText('2/2', { timeout: 10_000 });
  await expect(reply.locator('[data-ega-meta-item="version"]')).toHaveText('Shorter', {
    timeout: 10_000,
  });
  await expect(page.locator('[data-ega-user-turn]')).toHaveCount(1);
  await expect(page.locator('[data-ega-reply]')).toHaveCount(1);
  timeline.markStep('variant-spawned');

  // Poll: the route capture races the UI.
  await expect
    .poll(() => route.lastRequestBody(), { timeout: 5_000 })
    .toMatch(/Refinement for this response: Make outputs shorter\./);
  timeline.markStep('wire-payload-asserted');

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  // Raw storage may omit `advanced`: the app fills defaults in memory but never writes them back.
  const seededRules = (s?.advanced as { rules?: { source: string }[] } | undefined)?.rules ?? [];
  expect(seededRules.some((r) => r.source === 'inplace')).toBe(false);
  timeline.markStep('no-persistence-asserted');
});
