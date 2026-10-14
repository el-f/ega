import { test, expect } from '@playwright/test';
import { launchExtension, onlyBackends, seedSettings, type ExtensionHandle } from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('gemini'),
    geminiApiKey: 'test-key',
    theme: 'dark',
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('backend hover and keyboard labels keep the popup width and height stable', async () => {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 360, height: 600 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  const chip = page.getByRole('button', { name: 'Gemini is ready. Show backends' });
  await expect(chip).toBeVisible();
  await expect(page.locator('.popup-body')).not.toHaveClass(/pending/);
  await page.mouse.move(0, 599);
  const measure = () =>
    page.evaluate(() => {
      const body = document.body.getBoundingClientRect();
      const headerEl = document.querySelector('.popup-header');
      if (!headerEl) throw new Error('Popup header missing');
      const header = headerEl.getBoundingClientRect();
      return {
        width: body.width,
        height: body.height,
        headerWidth: header.width,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
  const before = await measure();
  expect(before.scrollWidth).toBe(360);
  for (let i = 0; i < 3; i++) {
    await chip.hover();
    await expect
      .poll(() => chip.evaluate((el) => getComputedStyle(el, '::after').content))
      .toContain('Gemini is ready');
    expect(await measure()).toEqual(before);
    await page.mouse.move(0, 599);
    expect(await measure()).toEqual(before);
  }
  await chip.focus();
  await expect
    .poll(() => chip.evaluate((el) => getComputedStyle(el, '::after').content))
    .toContain('Gemini is ready');
  expect(await measure()).toEqual(before);
});

test('both language selectors fit the popup with auto-detect and a selected source', async () => {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await expect(page.locator('#pop-target')).toBeVisible();
  for (const source of ['auto', 'fr', 'zh-TW', 'auto']) {
    await page.locator('#pop-lang').selectOption(source);
    const fields = await page.locator('[data-ega-lang-pair] select').evaluateAll((selects) =>
      selects.map((select) => {
        const box = select.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, top: box.top };
      }),
    );
    expect(fields).toHaveLength(2);
    expect(fields.every((f) => f.left >= 12 && f.right <= 348 && f.width >= 120)).toBe(true);
    const [from, to] = fields;
    if (!from || !to) throw new Error('Both language fields must render');
    expect(from.top).toBe(to.top);
    await page.locator('#pop-target').selectOption('he');
    await expect(page.locator('#pop-target')).toHaveValue('he');
  }
});

test('the compact action icons share a row and submit sits inside the text box', async () => {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  const textarea = page.getByRole('textbox', { name: 'Translate in the side panel' });
  await textarea.fill('Hello, friend');
  await expect(textarea).toHaveValue('Hello, friend');
  await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeEnabled();
  const field = await textarea.boundingBox();
  const send = await page.getByRole('button', { name: 'Translate', exact: true }).boundingBox();
  expect(field).not.toBeNull();
  expect(send).not.toBeNull();
  if (!field || !send) throw new Error('Composer geometry missing');
  expect(send.x).toBeGreaterThan(field.x);
  expect(send.x + send.width).toBeLessThan(field.x + field.width);
  expect(send.y).toBeGreaterThan(field.y);
  expect(send.y + send.height).toBeLessThan(field.y + field.height);
  const actions = await page
    .locator('[data-ega-popup-primary], [data-ega-popup-tools] button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const r = button.getBoundingClientRect();
        return { top: r.top, width: r.width, height: r.height };
      }),
    );
  expect(actions).toHaveLength(5);
  expect(new Set(actions.map((a) => Math.round(a.top))).size).toBe(1);
  expect(actions.every((a) => a.width >= 28 && a.width <= 72 && a.height <= 40)).toBe(true);
});
