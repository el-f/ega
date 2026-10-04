/* coverage: integration.tooltip-sidepanel-escalation.tooltip-retry-budget-shared */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  suppressSidePanelOpen,
  seedSettings,
  type ExtensionHandle,
} from '../../../helpers';
import { assertStaysStable } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await suppressSidePanelOpen(ext.context, ext.extensionId);
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('sidepanel retry-budget slider mutates advanced.retryCount', async () => {
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('domcontentloaded');

  // The slider lives in a popover behind the header's More menu.
  await sp.locator('[data-ega-header-more]').click();
  await sp.locator('[data-ega-retry-budget-trigger]').click();
  const slider = sp.locator('[data-ega-retry-budget]');
  await expect(slider).toBeVisible();
  await expect(slider).toHaveAttribute('aria-label', 'Fallback backends');
  // The menu closing hands focus back to its trigger; the popover must survive that.
  await assertStaysStable(() => slider.isVisible(), true, { windowMs: 300, intervalMs: 50 });
  await expect(sp.locator('[data-ega-header-more]')).toBeInViewport();

  await sp.evaluate(() => {
    const el = document.querySelector('[data-ega-retry-budget]') as HTMLInputElement | null;
    if (el) {
      el.value = '3';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      // The write happens on release, not per step.
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // The patch round-trips through the settings bus, so poll for the stored value.
  await expect
    .poll(
      async () =>
        await sp.evaluate(async () => {
          const r = (await chrome.storage.local.get('ega.settings')) as Record<string, unknown>;
          const s = r['ega.settings'] as Record<string, unknown> | undefined;
          const adv = s?.['advanced'] as Record<string, unknown> | undefined;
          return adv?.['retryCount'];
        }),
      { timeout: 5_000 },
    )
    .toBe(3);
});
