/* coverage: integration.popup-sidepanel-handoff.two-handoffs-sequential */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline } from '../../_harness';

// A pre-completed `response` makes each drain synchronous, so order is not a streaming race.

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

test('two pre-completed handoffs before sidepanel opens: both seed turns render in insertion order', async () => {
  const timeline = createTimeline();

  // Keys are monotonic so the drain sort delivers them first, then second.
  const optPage = await ext.context.newPage();
  await optPage.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await optPage.evaluate(async () => {
    const KEY = 'ega.pendingPopupHandoff';
    const now = Date.now();
    const map: Record<string, unknown> = {
      [`${now}-1`]: {
        sourceText: 'first handoff message',
        sourceLang: 'auto',
        targetLang: 'en',
        task: 'translate',
        tone: 'neutral',
        ts: now,
        response: 'First translated answer',
      },
      [`${now}-2`]: {
        sourceText: 'second handoff message',
        sourceLang: 'auto',
        targetLang: 'en',
        task: 'translate',
        tone: 'neutral',
        ts: now + 1,
        response: 'Second translated answer',
      },
    };
    await new Promise<void>((resolve) => chrome.storage.session.set({ [KEY]: map }, resolve));
  });
  await optPage.close();
  timeline.markStep('two-handoffs-written');

  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);

  await expect(sp.locator('.ega-user-turn')).toHaveCount(2, { timeout: 15_000 });
  await expect(sp.locator('.ega-assistant-turn')).toHaveCount(2, { timeout: 15_000 });
  timeline.markStep('both-turns-rendered');

  await expect(sp.locator('.ega-user-turn').first()).toContainText('first handoff message');
  await expect(sp.locator('.ega-user-turn').last()).toContainText('second handoff message');

  await expect(sp.locator('.ega-assistant-body').first()).toContainText('First translated answer', {
    timeout: 10_000,
  });
  await expect(sp.locator('.ega-assistant-body').last()).toContainText('Second translated answer', {
    timeout: 10_000,
  });
  timeline.markStep('order-asserted');
});
