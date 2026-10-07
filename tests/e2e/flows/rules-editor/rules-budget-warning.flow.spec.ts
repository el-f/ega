/* coverage: templating.rules-editor.rules-budget-warning */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // Seed rules whose rendered block exceeds the 8 KB threshold.
  // Each rule body is ~200 chars; 50 rules ≈ 10 KB rendered.
  const rules = Array.from({ length: 50 }, (_, i) => ({
    id: `flow-budget-warn-${String(i).padStart(3, '0')}`,
    body: `Budget warning seed rule number ${i}. ${'x'.repeat(160)}`,
    category: 'always' as const,
    scope: { tasks: [] as string[] },
    source: 'manual' as const,
    addedAt: new Date().toISOString(),
    enabled: true,
  }));
  await seedSettings(ext.context, ext.extensionId, {
    advanced: {
      promptTemplate: { system: 'sys', user: 'usr {{text}}' },
      rules,
      perPresetTemplates: {},
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('budget-warn banner visible when rules block exceeds 8 KB', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-glossary').click();

  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  const banner = page.locator('[data-ega-rules-budget-warn]');
  await expect(banner).toBeVisible({ timeout: 5_000 });
  timeline.markStep('banner-visible');

  const text = await banner.textContent();
  expect(text).toMatch(/\d+\s*KB/i);
  timeline.markStep('kb-count-shown');
});
