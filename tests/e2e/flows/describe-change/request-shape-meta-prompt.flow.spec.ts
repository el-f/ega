/* coverage: templating.describe-change.request-shape-meta-prompt */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { assertRequestShape, createTimeline, type MockWithBody } from '../_harness';

// Hand-rolled mock, not mockAnthropic: describeChange takes the non-stream res.json() path.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test-describe-shape',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test.slow();

test('outbound LLM body carries the meta-prompt directive + user input', async () => {
  const timeline = createTimeline();
  const replyJson = JSON.stringify({
    category: 'prefer',
    body: 'Prefer Arabic numerals over Eastern numerals in translations.',
    scope: { tasks: [] },
  });
  let lastBody: string | null = null;
  await ext.context.route('https://api.anthropic.com/v1/messages', async (route) => {
    try {
      lastBody = route.request().postData();
    } catch {
      lastBody = null;
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'msg_shape_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: replyJson }],
        stop_reason: 'end_turn',
      }),
    });
  });
  const mock: MockWithBody = { lastRequestBody: () => lastBody };

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  await page.locator('[data-ega-workbench-chip="global"]').click();

  // The describe block is a collapsed <details> — open it before fill().
  await page.locator('[data-ega-describe-header] > summary').click();

  const USER_INPUT = 'prefer arabic numerals over eastern numerals';
  await page.locator('[data-ega-describe-input]').first().fill(USER_INPUT);
  await page.locator('[data-ega-describe-apply]').first().click();
  timeline.markStep('apply-clicked');

  // The persisted rule is the only deterministic end signal for the round-trip.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return (s?.advanced.rules ?? []).some((r) => /arabic numerals/i.test(r.body));
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  timeline.markStep('rule-persisted');

  expect(lastBody, 'mock never recorded a request body').not.toBeNull();

  // Anthropic splits the prompt across top-level `system` and messages[0], so scan the raw body.
  assertRequestShape(mock, /structured prompt rule for an English-translation Chrome extension/i);
  assertRequestShape(mock, new RegExp(USER_INPUT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  timeline.markStep('shape-asserted');
});
