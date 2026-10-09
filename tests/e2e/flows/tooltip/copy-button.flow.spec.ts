/* coverage: translation.tooltip.copy-button */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from '../../helpers';
import { createTimeline, waitForVisibleText } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
});

test.afterEach(async () => {
  await ext.close();
});

test('copy button writes translation to clipboard and flips icon to Copied', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  await waitForVisibleText(page, '.tooltip .body', 'Welcome, how are you?');
  timeline.markStep('body-visible');

  await page.locator('.tooltip button[aria-label="Copy translation"]').click();
  timeline.markStep('copy-clicked');

  // A headless clipboard read needs a focused page.
  await page.locator('body').focus();
  const clip = await page.evaluate(async () => navigator.clipboard.readText());
  expect(clip).toBe('Welcome, how are you?');

  const copiedFlipped = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const root = (host as HTMLElement | null)?.shadowRoot;
    const btn = root?.querySelector<HTMLButtonElement>(
      '.tooltip button[aria-label="Copy translation"]',
    );
    return {
      disabled: btn?.disabled ?? null,
      hasCheck: !!btn?.querySelector('.lucide-check'),
      tooltip: btn?.getAttribute('data-tooltip') ?? null,
      announced: root?.querySelector('[data-ega-copy-live]')?.textContent.trim() ?? null,
    };
  });
  // A disabled button drops focus to <body>, and Escape is bound to the panel root — so the icon and label carry the Copied state instead.
  expect(copiedFlipped.disabled).toBe(false);
  expect(copiedFlipped.hasCheck).toBe(true);
  expect(copiedFlipped.tooltip).toBe('Copied');
  // The icon and the label are sighted-only cues; this is what a screen reader is handed.
  expect(copiedFlipped.announced).toBe('Copied');
});
