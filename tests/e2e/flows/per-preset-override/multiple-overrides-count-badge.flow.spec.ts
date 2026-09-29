/* coverage: templating.per-preset-override.multiple-overrides-count-badge */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      snippets: {},
      perPresetTemplates: {
        arabizi: { system: 'Arabizi override sys.', user: 'Arabizi override user {{text}}' },
        elvish: { system: 'Elvish override sys.', user: 'Elvish override user {{text}}' },
      },
      taskTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('"2 languages already overridden" copy shows when two per-preset overrides are seeded', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();

  await page.locator('[data-ega-workbench-chip="per-preset"]').click();
  timeline.markStep('chip-open');

  const select = page.locator('[data-ega-prompt-workbench] select').first();
  await expect(select).toBeVisible({ timeout: 10_000 });

  // The Svelte template splits "2 languages already overridden" across lines, so match loosely.
  await expect
    .poll(
      async () => {
        const text = await page.locator('[data-ega-prompt-workbench]').innerText();
        return text;
      },
      { timeout: 10_000 },
    )
    .toMatch(/2 languages.*overridden/is);
  timeline.markStep('count-badge-visible');
});
