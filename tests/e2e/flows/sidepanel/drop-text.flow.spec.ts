/* coverage: translation.sidepanel.drop-text */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('drop text/plain on empty composer fills the textarea', async () => {
  mockAnthropic(ext.context, { translation: 'noop' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  const composer = page.locator('#sp-text').first();
  await composer.waitFor({ state: 'visible', timeout: 5_000 });

  await composer.evaluate((el, payload) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', payload);
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, 'hello dropped world');

  await expect(composer).toHaveValue('hello dropped world');
});

test('whitespace-only composer treats drop as fresh value (no leading blank line)', async () => {
  mockAnthropic(ext.context, { translation: 'noop' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  const composer = page.locator('#sp-text').first();
  await composer.waitFor({ state: 'visible', timeout: 5_000 });

  // The send-button empty check uses trim(), so the drop handler has to treat whitespace as empty too.
  await composer.fill('   \n');

  await composer.evaluate((el, payload) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', payload);
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, 'fresh content');

  await expect(composer).toHaveValue('fresh content');
});

test('image-priority — text payload ignored when image file present', async () => {
  mockAnthropic(ext.context, { translation: 'noop' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  const composer = page.locator('#sp-text').first();
  await composer.waitFor({ state: 'visible', timeout: 5_000 });

  // Mixed drop: the image branch short-circuits, so the text payload never reaches the textarea.
  await composer.evaluate((el, payload) => {
    const png1x1 = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const dt = new DataTransfer();
    dt.items.add(new File([png1x1], 'pixel.png', { type: 'image/png' }));
    dt.setData('text/plain', payload);
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, 'this text should NOT appear');

  await expect(composer).toHaveValue('');
});

test('drop text/plain on non-empty composer appends with newline separator', async () => {
  mockAnthropic(ext.context, { translation: 'noop' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  const composer = page.locator('#sp-text').first();
  await composer.waitFor({ state: 'visible', timeout: 5_000 });

  await composer.fill('existing line');

  await composer.evaluate((el, payload) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', payload);
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, 'dropped tail');

  await expect(composer).toHaveValue('existing line\ndropped tail');
});
