import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
  });
  mockAnthropic(ext.context, { translation: 'Welcome' });
});

test.afterEach(async () => {
  await ext.close();
});

test('smart bubble appears on digit-less Arabizi', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'digitless-arabizi';
    p.textContent = 'yarayt rase fade add rasak';
    document.body.appendChild(p);
  });

  await page.evaluate(() => {
    const el = document.getElementById('digitless-arabizi');
    if (!el) throw new Error('digitless-arabizi missing');
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection');
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
});

test('smart bubble stays hidden on plain English paragraph', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'plain-english';
    p.textContent = 'hello world this is a plain English test sentence';
    document.body.appendChild(p);
  });

  await page.evaluate(() => {
    const el = document.getElementById('plain-english');
    if (!el) throw new Error('plain-english missing');
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection');
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? -1, { timeout: 1_500 })
    .toBe(0);
});
