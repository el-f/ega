/* coverage: templating.rules-editor.describe-change-in-rules-tab */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

const LLM_RULE_BODY = 'Always keep numbers in the source script unchanged.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test-rules-tab',
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

test('Rules tab DescribeYourChange Apply → LLM mock → rule added with scope.tasks=[]', async () => {
  const timeline = createTimeline();
  const replyJson = JSON.stringify({
    category: 'always',
    body: LLM_RULE_BODY,
    scope: { tasks: [] },
  });

  let releaseFulfill: () => void = () => {};
  const fulfillReady = new Promise<void>((resolve) => {
    releaseFulfill = resolve;
  });

  // describeChange sends stream:false and calls res.json(), so the mock is a plain envelope.
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    await fulfillReady;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'msg_rules_tab_test',
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

  await page.locator('[data-ega-workbench-chip="rules"]').click();
  await expect(page.locator('[data-ega-rules-editor]')).toBeVisible({ timeout: 5_000 });
  timeline.markStep('rules-mounted');

  const describeWidget = page.locator('[data-ega-rules-editor] [data-ega-describe-your-change]');
  await expect(describeWidget).toBeVisible({ timeout: 5_000 });

  const input = describeWidget.locator('[data-ega-describe-input]');
  await input.fill('keep numbers in source script');
  await describeWidget.locator('[data-ega-describe-apply]').click();
  timeline.markStep('apply-clicked');

  const busyLabel = describeWidget.locator('.busy-label');
  await expect(busyLabel).toBeVisible({ timeout: 5_000 });
  await expect(busyLabel).toHaveText(/asking your model/i);
  timeline.markStep('busy-visible');

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
  const added = s?.advanced.rules.find((r) => r.body === LLM_RULE_BODY);
  expect(added?.source).toBe('describe');
  expect(added?.scope.tasks).toEqual([]);
  expect(added?.category).toBe('always');
  timeline.markStep('shape-verified');
});
