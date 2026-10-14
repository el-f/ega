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

// Reword and Grammar answer in the language of the text, so their chip names no target.
const CHIP_CASES = [
  { task: 'explain', chip: 'Explain → English' },
  { task: 'summarize', chip: 'Summarize → English' },
  { task: 'reword', chip: 'Reword' },
  { task: 'grammar', chip: 'Grammar' },
] as const;

test('sidepanel: the mode chip names the picked task; Send keeps its name', async () => {
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  const chip = page.locator('[data-ega-mode-chip]');
  await expect(chip).toHaveText('Translate → English', { timeout: 5_000 });
  await chip.click();
  const popover = page.locator('[data-ega-mode-popover]');

  for (const { task, chip: label } of CHIP_CASES) {
    await popover.locator(`[data-ega-task="${task}"]`).click();
    await expect(chip).toHaveText(label);
    await expect(page.locator('[data-ega-send]')).toHaveAccessibleName('Send');
  }

  await popover.locator('[data-ega-task="translate"]').click();
  await expect(chip).toHaveText('Translate → English');
});

test('sidepanel: the tone row shows only for a task with a tone', async () => {
  mockAnthropic(ext.context);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await page.locator('[data-ega-mode-chip]').click();
  const popover = page.locator('[data-ega-mode-popover]');
  // Data attribute, not getByLabel('Tone') — several labels share that text.
  const toneSelect = popover.locator('[data-ega-tone-select]');
  await expect(toneSelect).toHaveCount(0);

  for (const task of ['explain', 'summarize', 'grammar'] as const) {
    await popover.locator(`[data-ega-task="${task}"]`).click();
    await expect(toneSelect).toHaveCount(0);
  }

  await popover.locator('[data-ega-task="reword"]').click();
  await expect(toneSelect).toBeVisible();

  await popover.locator('[data-ega-task="translate"]').click();
  await expect(toneSelect).toHaveCount(0);
});
