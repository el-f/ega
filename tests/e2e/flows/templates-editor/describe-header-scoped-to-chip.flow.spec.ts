/* coverage: templating.templates-editor.describe-header-scoped-to-chip */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const LLM_RULE_BODY = 'Always keep the original punctuation unchanged for reword task.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test-describe-scoped',
    advanced: {
      promptTemplate: { system: 'sys', user: '{{text}}' },
      taskTemplates: {},
      perPresetTemplates: {},
      temperature: 0.7,
      maxTokens: 2048,
      rules: [],
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Reword chip Refine row describe-change adds rule with scope.tasks=[reword]', async () => {
  const timeline = createTimeline();

  const replyJson = JSON.stringify({
    category: 'always',
    body: LLM_RULE_BODY,
    scope: { tasks: ['reword'] },
  });

  let releaseFulfill: () => void = () => {};
  const fulfillReady = new Promise<void>((resolve) => {
    releaseFulfill = resolve;
  });

  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await fulfillReady;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'msg_describe_scoped',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: replyJson }],
        stop_reason: 'end_turn',
      }),
    });
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  timeline.markStep('tab-open');

  await page.locator('[data-ega-workbench-chip="reword"]').click();
  timeline.markStep('reword-chip-clicked');

  const describeHeader = page.locator(
    '[data-ega-describe-header][data-ega-describe-scope="reword"]',
  );
  await expect(describeHeader).toBeVisible({ timeout: 10_000 });
  await describeHeader.locator('summary').click();
  timeline.markStep('refine-expanded');

  const input = describeHeader.locator('[data-ega-describe-input]').first();
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill('keep original punctuation unchanged');
  timeline.markStep('input-filled');

  await page.locator('[data-ega-describe-apply]').first().click();
  timeline.markStep('apply-clicked');

  const busyLabel = page.locator('[data-ega-describe-your-change] .busy-label').first();
  await expect(busyLabel).toBeVisible({ timeout: 5_000 });
  timeline.markStep('busy-label-visible');

  releaseFulfill();

  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).some((r) => r.body === LLM_RULE_BODY);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  timeline.markStep('rule-persisted');

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const rule = s?.advanced.rules.find((r) => r.body === LLM_RULE_BODY);
  expect(rule?.scope.tasks).toContain('reword');
  expect(rule?.source).toBe('describe');
  timeline.markStep('scope-verified');
});
