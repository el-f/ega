import { test, expect } from '@playwright/test';
import {
  customTask,
  launchExtension,
  mockAnthropic,
  onlyBackends,
  seedCustomTasks,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  sendFromPanel,
  setNextMessage,
  type ExtensionHandle,
} from './helpers';

const fields = [
  { key: 'answer', label: 'Outline', kind: 'list', role: 'main', required: true },
  { key: 'points', label: 'Key points', kind: 'list', role: 'notes', required: false },
  {
    key: 'tone',
    label: 'Tone',
    kind: 'choice',
    role: 'details',
    required: true,
    choices: ['Formal', 'Casual'],
  },
  { key: 'reasoning', label: 'Private reasoning', kind: 'text', role: 'hidden', required: false },
];
const result = JSON.stringify({
  answer: ['First useful item', 'Second useful item'],
  points: ['A useful note'],
  tone: 'Formal',
  reasoning: 'Hidden model field',
});
let ext: ExtensionHandle;
test.beforeEach(async () => {
  ext = await launchExtension();
  await seedCustomTasks(ext.context, ext.extensionId, [
    customTask({
      id: 'c-outline',
      label: 'Outline',
      system: 'Make an outline.',
      output: 'card',
      answer: { v: 1, fields },
    }),
  ]);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    ...onlyBackends('anthropic'),
    defaultTask: 'c-outline',
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
    captureResultMeta: true,
  });
});
test.afterEach(async () => {
  await ext.close();
});

test('custom list fields render as lists with stored labels in the side panel and tooltip', async ({
  browserName: _browserName,
}, info) => {
  const mock = mockAnthropic(ext.context, { rawText: result });
  const panel = await ext.context.newPage();
  await panel.setViewportSize({ width: 400, height: 850 });
  await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await setNextMessage(panel, { task: 'c-outline' });
  await sendFromPanel(panel, 'Please outline this short paragraph.');
  const reply = panel.locator('[data-ega-reply]');
  await expect(reply.getByText('First useful item', { exact: true })).toBeVisible();
  await expect(reply.locator('li', { hasText: 'First useful item' })).toHaveCount(1);
  await expect(reply.locator('[data-ega-note="points"]')).toContainText('Key points');
  await expect(panel.getByText('Hidden model field', { exact: true })).toHaveCount(0);
  await panel.screenshot({
    animations: 'disabled',
    path: info.outputPath('custom-list-panel.png'),
  });

  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 400, height: 850 });
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  const tooltip = page.locator('.tooltip');
  await expect(tooltip.locator('li', { hasText: 'First useful item' })).toBeVisible();
  await expect(tooltip.locator('[data-ega-note="points"]')).toContainText('A useful note');
  await expect(tooltip).not.toContainText('Hidden model field');
  await expect.poll(() => mock.calls()).toBe(2);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('custom-list-tooltip.png'),
  });
  await tooltip.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'About this reply' }).click();
  await expect(tooltip.locator('[data-ega-answer-fields]')).toContainText('Formal');
  await expect(tooltip.locator('[data-ega-answer-fields]')).not.toContainText('Hidden model field');
  await page.screenshot({ animations: 'disabled', path: info.outputPath('custom-list-about.png') });
});

for (const { theme, width } of [
  { theme: 'light', width: 1100 },
  { theme: 'dark', width: 400 },
  { theme: 'light', width: 320 },
  { theme: 'dark', width: 256 },
] as const) {
  test(`answer field editor and Try it preview in ${theme} at ${width}px`, async ({
    browserName: _browserName,
  }, info) => {
    await seedSettings(ext.context, ext.extensionId, { theme });
    const mock = mockAnthropic(ext.context, { rawText: result });
    const page = await ext.context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.locator('#tab-tasks').click();
    await page
      .locator('[data-ega-custom-task-list]')
      .getByRole('button', { name: /Edit Outline/ })
      .click();
    const dialog = page.locator('[data-ega-custom-task-dialog]');
    await expect(dialog.locator('[data-ega-answer-fields-editor]')).toBeVisible();
    await dialog.getByRole('button', { name: 'Edit Outline' }).click();
    await dialog.locator('[data-ega-answer-field="answer"] .af-edit').scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`answer-editor-${theme}-${width}.png`),
    });
    const preview = dialog.locator('[data-ega-answer-preview]');
    await preview.getByRole('button', { name: 'Try it' }).click();
    await expect(preview.getByText('All fields came back')).toBeVisible();
    await expect(preview.locator('li', { hasText: 'First useful item' })).toBeVisible();
    expect(mock.calls()).toBe(1);
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`answer-preview-${theme}-${width}.png`),
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test('a wrong-format reply retries once and names the task format problem', async () => {
  const mock = mockAnthropic(ext.context, { rawText: '{"wrong":17}' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await expect(page.locator('.tooltip')).toContainText('Wrong format');
  await expect.poll(() => mock.calls()).toBe(2);
  await expect(page.locator('.tooltip').getByRole('button', { name: /settings/i })).toBeVisible();
});

test('converting a prompt format is explicit and Undo restores its original instructions', async () => {
  const system = 'Keep this instruction. Return JSON ONLY: {"answer": "...", "tags": "..."}.';
  await seedCustomTasks(ext.context, ext.extensionId, [
    customTask({ id: 'c-convert', label: 'Convert me', system }),
  ]);
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();
  await page
    .locator('[data-ega-custom-task-list]')
    .getByRole('button', { name: 'Edit Convert me' })
    .click();
  const dialog = page.locator('[data-ega-custom-task-dialog]');
  await expect(dialog.getByRole('button', { name: 'Turn them into fields' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Turn them into fields' }).click();
  await expect(dialog.locator('[data-ega-answer-fields-editor]')).toContainText('Tags');
  await expect(dialog.locator('[data-ega-template-system] textarea')).toHaveValue(
    'Keep this instruction.',
  );
  await page.locator('[data-ega-dialog-undo]').click();
  await expect(dialog.locator('[data-ega-template-system] textarea')).toHaveValue(system);
  await expect(dialog.locator('[data-ega-answer-fields-editor]')).toHaveCount(0);
});
