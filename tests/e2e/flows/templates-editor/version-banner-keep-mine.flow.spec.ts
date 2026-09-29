/* coverage: templating.templates-editor.version-banner-keep-mine */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { CURRENT_TEMPLATE_VERSION } from '../../../../src/shared/settings-schema';
import { createTimeline } from '../_harness';

const CUSTOM_SYSTEM = '/* VERSION-BANNER-KEEP-MINE-SYS */ Custom system.';
const CUSTOM_USER = '/* VERSION-BANNER-KEEP-MINE-USR */ Translate: {{text}}';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: CUSTOM_SYSTEM, user: CUSTOM_USER },
      templateVersion: CURRENT_TEMPLATE_VERSION - 1,
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
      taskTemplates: {},
      rules: [],
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Keep mine sets templateVersionAcknowledged; promptTemplate unchanged', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  const banner = page.locator('[data-ega-tpl-version-banner]');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  timeline.markStep('banner-visible');

  await page.locator('[data-ega-tpl-keep-mine]').click();
  timeline.markStep('keep-mine-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.advanced.templateVersionAcknowledged ?? 0;
      },
      { timeout: 10_000 },
    )
    .toBe(CURRENT_TEMPLATE_VERSION);

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  expect(s?.advanced.promptTemplate.system).toBe(CUSTOM_SYSTEM);
  expect(s?.advanced.promptTemplate.user).toBe(CUSTOM_USER);
  timeline.markStep('storage-verified');

  await expect(banner).not.toBeVisible({ timeout: 5_000 });
  timeline.markStep('banner-dismissed');
});
