import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from './helpers';

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

const TASK_LABEL_CASES = [
  { task: 'explain', label: 'Explain' },
  { task: 'summarize', label: 'Summarize' },
  { task: 'reword', label: 'Reword' },
  { task: 'grammar', label: 'Grammar' },
] as const;

test('sidepanel: send button aria-label tracks task', async () => {
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await expect(page.getByRole('button', { name: /^Translate$/ })).toBeVisible();

  for (const { task, label } of TASK_LABEL_CASES) {
    await page.locator(`[data-ega-task="${task}"]`).click();
    await expect(page.getByRole('button', { name: new RegExp(`^${label}$`) })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Translate$/ })).toHaveCount(0);
  }

  await page.locator('[data-ega-task="translate"]').click();
  await expect(page.getByRole('button', { name: /^Translate$/ })).toBeVisible();
});

test('sidepanel: tone select renders only when task = reword', async () => {
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  // Data attribute, not getByLabel('Tone') — several labels share that text.
  const toneSelect = page.locator('[data-ega-tone-select]');

  await expect(toneSelect).toHaveCount(0);

  for (const task of ['explain', 'summarize', 'grammar'] as const) {
    await page.locator(`[data-ega-task="${task}"]`).click();
    await expect(toneSelect).toHaveCount(0);
  }

  await page.locator('[data-ega-task="reword"]').click();
  await expect(toneSelect).toBeVisible();

  await page.locator('[data-ega-task="translate"]').click();
  await expect(toneSelect).toHaveCount(0);
});
