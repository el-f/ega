import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

// Clipboard needs grantPermissions — Chromium throws "Document is not focused" without it.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    tooltipClickOutside: true,
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

async function selectById(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`${id} missing`);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no selection');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  }, id);
}

test('Tooltip exposes the expected icon buttons with data-tooltip labels', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();

  await selectById(page, 'arabizi');
  await expect
    .poll(async () => (await egaTest<number>(page, 'bubbleCount')) ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
  // Hotkey instead of a bubble click: the click dispatch races the bubble's show animation.
  await page.keyboard.press('Control+Shift+L');
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 20_000 })
    .toContain('Welcome');

  // The Copy/Explain row mounts only after the done chunk, so poll — a delta can land first.
  await expect
    .poll(
      async () => {
        const labels = (await egaTest<string[]>(page, 'listButtons')) ?? [];
        return labels.map((l) => l.toLowerCase()).join(' ');
      },
      { timeout: 10_000 },
    )
    .toMatch(/copy.*explain|explain.*copy/);

  const labels = (await egaTest<string[]>(page, 'listButtons')) ?? [];
  const joined = labels.map((l) => l.toLowerCase()).join(' ');
  // With tooltipClickOutside=true (seeded above) there is no Close button.
  for (const needle of ['copy', 'explain']) {
    expect(joined).toContain(needle);
  }
  expect(joined).not.toContain('close');
});

test('Task dropdown renders the full "Translate" label without truncation', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome' });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();

  await selectById(page, 'arabizi');
  // Hotkey instead of clickBubble: the click can land before the bubble handler is wired.
  await page.keyboard.press('Control+Shift+L');
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 20_000 })
    .toContain('Welcome');

  // The task select sits in a CLOSED shadow root — `host.shadowRoot` is null, so use the hook.
  const translateLabel = (await egaTest<string>(page, 'taskSelectOptionLabel', 'translate')) ?? '';
  expect(translateLabel).toBe('Translate');
  const rewordLabel = (await egaTest<string>(page, 'taskSelectOptionLabel', 'reword')) ?? '';
  expect(rewordLabel).toBe('Reword');
});

test('Copy button round-trips punctuation and Unicode verbatim', async () => {
  const canned = 'Welcome home — "مرحبا" 👋!';
  mockAnthropic(ext.context, { translation: canned });

  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/smart-bubble-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();

  await selectById(page, 'arabizi');
  await page.keyboard.press('Control+Shift+L');
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 20_000 })
    .toContain('Welcome home');

  const ok = await egaTest<boolean>(page, 'clickAction', 'copy');
  expect(ok).toBe(true);

  const clip = await page.evaluate(async () => navigator.clipboard.readText());
  expect(clip).toBe(canned);
});
