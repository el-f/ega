/* coverage: integration.settings-runtime-propagation.quota-near-full-degrades-gracefully */
import { test, expect } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    backendOrder: ['anthropic', 'openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
    disabledBackends: ['openai', 'gemini', 'ollama', 'native', 'groq', 'deepseek'],
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('SW classifies storage QUOTA failure as reason:quota on settings:update ack', async () => {
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('SW not registered');
  await sw.evaluate(() => {
    const c = (
      globalThis as unknown as {
        chrome: { storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } } };
      }
    ).chrome;
    const original = c.storage.local.set.bind(c.storage.local);
    (
      globalThis as unknown as {
        __egaPriorSet__?: (items: Record<string, unknown>) => Promise<void>;
      }
    ).__egaPriorSet__ = original;
    let remaining = 1;
    c.storage.local.set = (items: Record<string, unknown>): Promise<void> => {
      if (remaining > 0) {
        remaining -= 1;
        return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
      }
      return original(items);
    };
  });

  const opts = await ext.context.newPage();
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await opts.waitForLoadState('domcontentloaded');

  const ack = (await opts.evaluate(async () => {
    return await chrome.runtime.sendMessage({
      kind: 'settings:update',
      patch: { theme: 'dark' },
    });
  })) as { ok: boolean; reason?: string };

  expect(ack.ok).toBe(false);
  expect(ack.reason).toBe('quota');

  // Restore so afterEach cleanup is clean.
  await sw.evaluate(() => {
    const c = (
      globalThis as unknown as {
        chrome: { storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } } };
      }
    ).chrome;
    const g = globalThis as unknown as {
      __egaPriorSet__?: (items: Record<string, unknown>) => Promise<void>;
    };
    if (g.__egaPriorSet__) {
      c.storage.local.set = g.__egaPriorSet__;
      delete g.__egaPriorSet__;
    }
  });
});
