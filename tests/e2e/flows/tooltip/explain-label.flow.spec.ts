/* coverage: translation.tooltip.explain-label */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  seedSettings,
  mockAnthropic,
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
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    defaultTask: 'explain',
  });
  // The mock is slow on purpose: the loading state must stay up long enough to read the label.
  mockAnthropic(ext.context, {
    translation: 'Welcome',
    confidence: 0.95,
    delayMs: 500,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('default-task=explain → shimmer shows "Explaining…" not "Translating…"', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  timeline.markStep('translate-fired');

  // The shimmer label lives inside the content-script shadow DOM.
  const labelText = await page.evaluate(async () => {
    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
      const host = document.querySelector('#ega-shadow-host');
      const root = (host as HTMLElement | null)?.shadowRoot;
      const label = root?.querySelector('.shimmer-label');
      if (label?.textContent) return label.textContent;
      await new Promise((r) => setTimeout(r, 50));
    }
    return '';
  });
  timeline.markStep('label-visible');

  expect(labelText).toBe('Explaining…');
  expect(labelText).not.toBe('Translating…');
});
