/* coverage: integration.popup-sidepanel-handoff.warm-handoff-then-refine */
import { test, expect } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  type ExtensionHandle,
  openReplyMenu,
} from '../../../helpers';
import { createTimeline } from '../../_harness';

// The warm drain must set lastDispatch too, or the refine chip bails and no variant spawns.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('warm sidepanel receives handoff via storage.onChanged; refine chip on delivered turn spawns a variant', async () => {
  const timeline = createTimeline();
  const route = mockAnthropic(ext.context, { translation: 'Bonjour le monde' });

  // The sidepanel must open first so its storage listener is already live.
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });
  timeline.markStep('sidepanel-open-warm');

  // A pre-completed `response` routes the drain through seedDeliveredTurn.
  await sp.evaluate(async () => {
    const KEY = 'ega.pendingPopupHandoff';
    const now = Date.now();
    const map: Record<string, unknown> = {
      [`${now}-1`]: {
        sourceText: 'translate hello warm',
        sourceLang: 'auto',
        targetLang: 'en',
        task: 'translate',
        tone: 'neutral',
        ts: now,
        response: 'Bonjour chaud',
      },
    };
    await new Promise<void>((resolve) => chrome.storage.session.set({ [KEY]: map }, resolve));
  });
  timeline.markStep('warm-handoff-written');

  await expect(sp.locator('.ega-user-turn').first()).toContainText('translate hello warm', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-answer').first()).toContainText('Bonjour chaud', {
    timeout: 10_000,
  });
  timeline.markStep('warm-turn-delivered');

  const menu = await openReplyMenu(sp, 'refine');
  const shorter = menu.locator('[data-ega-refine-preset="shorter"]');
  await expect(shorter).toBeVisible({ timeout: 5_000 });
  timeline.markStep('menu-open');

  await shorter.click();
  timeline.markStep('preset-picked');

  await expect(sp.locator('[data-ega-variant-nav]')).toBeVisible({ timeout: 10_000 });
  await expect(sp.locator('.ega-user-turn')).toHaveCount(1);
  await expect(sp.locator('[data-ega-reply]')).toHaveCount(1);
  timeline.markStep('variant-spawned');

  await expect
    .poll(() => route.lastRequestBody(), { timeout: 5_000 })
    .toMatch(/Refinement for this response: Make outputs shorter\./);
  timeline.markStep('wire-payload-asserted');
});
