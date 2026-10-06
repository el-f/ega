/* coverage: translation.sidepanel.quick-refine-chip */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  readStorage,
  seedSettings,
  type ExtensionHandle,
  openRefineChips,
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

test('clicking [Shorter] chip spawns a variant + injects an ephemeral refinement (no persistence)', async () => {
  const timeline = createTimeline();
  const route = mockAnthropic(ext.context, { translation: 'Hello.' });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('hola amigo');
  await page.getByRole('button', { name: /^Translate$/ }).click();
  await expect(page.locator('.ega-assistant-body').first()).toContainText('Hello', {
    timeout: 10_000,
  });
  timeline.markStep('first-turn-done');

  // The chips stay hidden until the newest reply's Refine button opens them.
  await expect(page.locator('[data-ega-quick-refine]')).toHaveCount(0);
  await openRefineChips(page);
  const shorter = page.locator('[data-ega-refine-chip="shorter"]');
  await expect(shorter).toBeVisible({ timeout: 5_000 });
  timeline.markStep('chips-mounted');

  await shorter.click();
  timeline.markStep('chip-clicked');
  // A refine that went out closes the row.
  await expect(page.locator('[data-ega-quick-refine]')).toHaveCount(0);

  await expect(page.locator('[data-ega-variant-nav]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.ega-user-turn')).toHaveCount(1);
  await expect(page.locator('.ega-assistant-turn')).toHaveCount(1);
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
