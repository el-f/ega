/* coverage: templating.describe-change.llm-failure-falls-back */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

// HTTP 500, not all-backends-disabled: that guard refuses the rule write and masks the fallback.

const RAW_INPUT = 'Always use British spelling in translations.';
const OTHER_BACKEND_IDS: readonly string[] = [
  'native',
  'openai',
  'gemini',
  'groq',
  'deepseek',
  'ollama',
];

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test-describe-fail',
    backendOrder: ['anthropic'],
    disabledBackends: OTHER_BACKEND_IDS,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('SW {ok:false} falls back to heuristic rule + storage gets the rule', async () => {
  const timeline = createTimeline();

  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  await page.locator('[data-ega-workbench-chip="global"]').click();

  // The input sits inside a collapsed <details> — open it before fill().
  await page.locator('[data-ega-describe-header] > summary').click();

  await page.locator('[data-ega-describe-input]').first().fill(RAW_INPUT);
  await page.locator('[data-ega-describe-apply]').first().click();
  timeline.markStep('apply-clicked');

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).find((r) => r.body === RAW_INPUT) ?? null;
      },
      { timeout: 20_000 },
    )
    .not.toBeNull();
  timeline.markStep('fallback-rule-persisted');

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const seeded = s?.advanced.rules.find((r) => r.body === RAW_INPUT);
  expect(seeded?.category).toBe('always');
  // The heuristic fallback still marks the rule source='describe', not 'manual'.
  expect(seeded?.source).toBe('describe');
});
