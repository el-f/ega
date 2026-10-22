/* coverage: translation.smart-bubble.bubble-menu-run-task */
import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    bubbleFirstRunSeen: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('Run task in the bubble menu runs the picked task on the selection', async () => {
  const timeline = createTimeline();
  const api = mockAnthropic(ext.context, { translation: 'A short summary.' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await selectArabiziParagraph(page);
  await expect.poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0).toBe(1);
  expect(await egaTest<boolean>(page, 'clickBubbleMenu')).toBe(true);
  const menu = page.getByRole('menu', { name: 'Bubble options' });
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Run task',
    'Turn off on this site',
    'Bubble settings',
  ]);
  await menu.getByRole('menuitem', { name: 'Run task' }).click();
  const tasks = page.getByRole('menu', { name: 'Run task' });
  await expect(tasks.getByRole('menuitem', { name: 'Summarize' })).toBeVisible();
  timeline.markStep('tasks-open');

  await tasks.getByRole('menuitem', { name: 'Summarize' }).click();
  await expect.poll(async () => egaTest<number>(page, 'bubbleCount')).toBe(0);
  await expect.poll(async () => (await egaTest<number>(page, 'tooltipCount')) ?? 0).toBe(1);
  await expect.poll(() => api.calls()).toBeGreaterThan(0);
  expect(api.lastRequestBody()).toContain('your summary');
  timeline.markStep('task-ran');
});

test('the task list stays on screen in a narrow window', async () => {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await selectArabiziParagraph(page);
  await expect.poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0).toBe(1);
  expect(await egaTest<boolean>(page, 'clickBubbleMenu')).toBe(true);
  await page.getByRole('menuitem', { name: 'Run task' }).hover();
  const tasks = page.getByRole('menu', { name: 'Run task' });
  await expect(tasks).toBeVisible();
  await expect
    .poll(async () => {
      const box = await tasks.boundingBox();
      return box !== null && box.x >= 0 && box.x + box.width <= 360 && box.y + box.height <= 640;
    })
    .toBe(true);
});
