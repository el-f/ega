import { test, expect } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  readStorage,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('tooltip ↔ swaps source/target; translate uses swapped direction and persists sitePref', async () => {
  const mock = mockAnthropic(ext.context, {
    translation: '¡Hola, cómo estás?',
    confidence: 0.9,
  });

  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
    bubbleMode: 'always',
    defaultLang: 'en',
    defaultTargetLang: 'es',
  });

  const page = await ext.context.newPage();
  const hostOrigin = ext.serverUrl;
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await page.evaluate(() => {
    const el = document.getElementById('arabizi');
    if (!el) throw new Error('arabizi paragraph missing');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const before = (await egaTest<string>(page, 'bubbleDirection')) ?? '';
  expect(before).toBe('en→es');

  const clicked = await egaTest<boolean>(page, 'clickBubble');
  expect(clicked).toBe(true);

  await expect
    .poll(async () => (await egaTest<number>(page, 'tooltipCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);

  // Swap must land after the first translate, or it re-fires the same direction.
  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBeGreaterThan(0);
  const callsBeforeSwap = mock.calls();

  const swapClicked = await egaTest<boolean>(page, 'clickAction', 'Swap direction');
  expect(swapClicked).toBe(true);

  await expect.poll(() => mock.calls(), { timeout: 10_000 }).toBeGreaterThan(callsBeforeSwap);

  const body = mock.lastRequestBody();
  expect(body).toBeTruthy();
  if (!body) throw new Error('no body');
  // After the swap the pair is es → en, so the prompt names English as the target.
  expect(body).toContain('English');
  expect(body).toContain('Spanish');

  await expect
    .poll(
      async () => {
        const settings = await readStorage<{ sitePrefs?: Record<string, unknown> }>(
          ext.context,
          ext.extensionId,
          'ega.settings',
        );
        const pref = settings?.sitePrefs?.[hostOrigin] as
          { lastDirection?: { source: string; target: string } } | undefined;
        return pref?.lastDirection ?? null;
      },
      { timeout: 10_000 },
    )
    .toEqual({ source: 'es', target: 'en' });
});

test('bubble shows the detected variety when default source is "auto"', async () => {
  mockAnthropic(ext.context);

  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    bubbleMode: 'always',
    defaultLang: 'auto',
    defaultTargetLang: 'en',
  });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);

  await page.evaluate(() => {
    const el = document.getElementById('arabizi');
    if (!el) throw new Error('arabizi paragraph missing');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });

  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);

  const dir = (await egaTest<string>(page, 'bubbleDirection')) ?? '';
  expect(dir).toBe('Arabizi → English');
});
