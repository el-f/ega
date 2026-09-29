/* coverage: templating.describe-change.llm-success-adds-rule */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

// Hand-rolled route, not `mockAnthropic`: describeChange calls `res.json()`, which cannot read an SSE body.

const LLM_RULE_BODY = 'Always preserve emoji unchanged in the target language.';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test-describe',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('Describe-your-change Apply path persists LLM-derived rule', async () => {
  const timeline = createTimeline();
  const replyJson = JSON.stringify({
    category: 'always',
    body: LLM_RULE_BODY,
    scope: { tasks: [] },
  });
  // Hold the response back until the busy label is asserted.
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
        id: 'msg_describe_test',
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

  // The Refine row starts collapsed, so the input is not reachable until it opens.
  await page.locator('[data-ega-workbench-chip="global"]').click();
  const header = page.locator('[data-ega-describe-header][data-ega-describe-scope="global"]');
  await expect(header).toBeVisible({ timeout: 10_000 });
  await header.locator('summary').click();
  const input = header.locator('[data-ega-describe-input]').first();
  await expect(input).toBeVisible({ timeout: 10_000 });

  await input.fill('preserve emojis unchanged');
  await page.locator('[data-ega-describe-apply]').first().click();
  timeline.markStep('apply-clicked');

  // LoadingState's own label is aria-hidden, so assert the sibling busy-label span sighted users read.
  const busyLabel = page.locator('[data-ega-describe-your-change] .busy-label').first();
  await expect(busyLabel).toBeVisible({ timeout: 5_000 });
  await expect(busyLabel).toHaveText(/asking your model/i);
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
  timeline.markStep('llm-rule-persisted');

  const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
  const seeded = s?.advanced.rules.find((r) => r.body === LLM_RULE_BODY);
  expect(seeded?.category).toBe('always');
  // 'describe' is the source on both the LLM and the fallback path, so it does not pin which ran.
  expect(seeded?.source).toBe('describe');
});
