/* coverage: options.backends.model-reset-to-default */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, seedSettings, type ExtensionHandle } from '../../helpers';
import type { Settings } from '../../../../src/shared/types';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

// Anthropic default model from settings-schema.ts DEFAULT_MODEL.
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

test.beforeEach(async () => {
  ext = await launchExtension();
  // Seed key first so the model section renders (gated on !disabled = key present).
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-ant-seed',
  });
  // modelShape is strict: a partial object falls back to DEFAULT_MODEL, so seed every slot.
  await seedSettings(ext.context, ext.extensionId, {
    model: {
      anthropic: 'claude-opus-4-5',
      openai: 'gpt-4o-mini',
      gemini: 'gemini-2.5-flash',
      groq: 'llama-3.3-70b-versatile',
      deepseek: 'deepseek-chat',
      together: '',
      mistral: '',
      xai: '',
      fireworks: '',
      openrouter: '',
      ollama: '',
      native: '',
    },
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('ResetField arrow reverts model to provider default', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  timeline.markStep('tab-active');

  const card = page.locator('details[data-backend-id="anthropic"]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  const isOpen = await card.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    await card.locator('summary').click();
  }

  const modelInput = card.locator('input.ega-combobox-input');
  await expect(modelInput).toBeVisible({ timeout: 5_000 });
  // Verify it shows the non-default value.
  await expect(modelInput).toHaveValue('claude-opus-4-5');
  timeline.markStep('non-default-visible');

  // ResetField button appears because model !== defaultModelId.
  const resetBtn = card.getByRole('button', { name: 'Reset model id to default' });
  await expect(resetBtn).toBeVisible({ timeout: 5_000 });
  await resetBtn.click();
  timeline.markStep('reset-clicked');

  // Input reverts to default.
  await expect(modelInput).toHaveValue(DEFAULT_ANTHROPIC_MODEL, { timeout: 5_000 });
  timeline.markStep('input-reverted');

  // Storage reflects the default.
  await expect
    .poll(
      async () => {
        const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
        return s?.model.anthropic;
      },
      { timeout: 5_000 },
    )
    .toBe(DEFAULT_ANTHROPIC_MODEL);
  timeline.markStep('storage-reverted');

  // ResetField button disappears once value equals default.
  await expect(resetBtn).not.toBeVisible({ timeout: 3_000 });

  timeline.report();
});
