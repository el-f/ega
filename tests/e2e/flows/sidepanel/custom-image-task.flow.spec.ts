/* coverage: translation.sidepanel.custom-image-task */
import { test, expect } from '@playwright/test';
import {
  customTask,
  launchExtension,
  mockAnthropic,
  seedCustomTasks,
  seedSettings,
  setNextMessage,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'test-key' });
  await seedCustomTasks(ext.context, ext.extensionId, [
    customTask({
      id: 'c-describe',
      label: 'Describe photo',
      system: 'Describe the picture for a blind reader.',
      image: true,
    }),
  ]);
});

test.afterEach(async () => {
  await ext.close();
});

test('an image sent with an image-taking custom task carries the custom prompt', async () => {
  const timeline = createTimeline();
  const mock = mockAnthropic(ext.context, { translation: 'A red square', confidence: 0.9 });
  const panel = await ext.context.newPage();
  await panel.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  const composer = panel.locator('#sp-text');
  await composer.waitFor({ state: 'visible', timeout: 5_000 });
  await setNextMessage(panel, { task: 'c-describe' });
  await expect(panel.locator('[data-ega-mode-chip]')).toContainText('Describe photo');

  await composer.evaluate((el) => {
    const png1x1 = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const dt = new DataTransfer();
    dt.items.add(new File([png1x1], 'pixel.png', { type: 'image/png' }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  timeline.markStep('image-attached');

  await expect(panel.locator('[data-ega-next-send]')).toContainText('Image');
  await panel.locator('[data-ega-send]').click();
  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBe(1);
  const body = mock.lastRequestBody() ?? '';
  expect(body).toContain('Describe the picture for a blind reader.');
  expect(body).toContain('"type":"image"');
  timeline.markStep('request');
  timeline.report();
});
