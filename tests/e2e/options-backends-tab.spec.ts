import { test, expect } from '@playwright/test';
import { launchExtension, onlyBackends, seedSettings, type ExtensionHandle } from './helpers';
import { DEFAULT_SETTINGS } from '../../src/shared/settings-defaults';
import { CLOUD_PROVIDER_IDS } from '../../src/shared/provider-ids';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Backends tab: every registered cloud + local backend renders a card', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    disabledBackends: [...DEFAULT_SETTINGS.disabledBackends],
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: /^Backends$/ }).click();

  // Each card owns its own `data-section` wrapper; there is no grouping parent.
  await expect(page.locator('[data-section="cloud"]')).toHaveCount(CLOUD_PROVIDER_IDS.length);
  await expect(page.locator('[data-section="local"]')).toHaveCount(2);
  await expect(page.locator('[data-section="native"]')).toHaveCount(1);

  for (const id of CLOUD_PROVIDER_IDS) {
    await expect(page.locator(`[data-section="cloud"] [data-backend-id="${id}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-section="local"] [data-backend-id="ollama"]')).toBeVisible();
  await expect(
    page.locator('[data-section="local"] [data-backend-id="localserver"]'),
  ).toBeVisible();
});

test('Backends tab: every card starts collapsed, including one that needs setup', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: '',
    disabledBackends: [...DEFAULT_SETTINGS.disabledBackends],
  });

  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: /^Backends$/ }).click();

  const anthropicCard = page.locator('[data-backend-id="anthropic"]');
  const openaiCard = page.locator('[data-backend-id="openai"]');
  await expect(anthropicCard).toBeVisible();
  await expect(openaiCard).toBeVisible();

  // Anthropic ships enabled with a blank key (needs setup) and still starts collapsed.
  await expect(anthropicCard.locator('[data-ega-backend-status="Needs setup"]')).toBeVisible({
    timeout: 5_000,
  });
  await expect(anthropicCard).not.toHaveAttribute('open', '');
  await expect(openaiCard).not.toHaveAttribute('open', '');
});

test('expanded backend forms use the row width and keep controls inside at narrow widths', async () => {
  test.setTimeout(60_000);
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('anthropic', 'ollama', 'localserver', 'native'),
    anthropicApiKey: 'test-key',
    onboardingDismissed: true,
  });
  const page = await ext.context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.getByRole('tab', { name: /^Backends$/ }).click();
  for (const width of [400, 320]) {
    await page.setViewportSize({ width, height: 800 });
    for (const id of ['anthropic', 'ollama', 'localserver', 'native']) {
      const card = page.locator(`details[data-backend-id="${id}"]`);
      await card.locator(':scope > summary').click();
      await expect(card).toHaveAttribute('open', '');
      const layout = await card.locator('.be-panel').evaluate((panel) => {
        const bounds = panel.getBoundingClientRect();
        const rowEl = panel.closest('[data-testid^="be-row-"]');
        if (!rowEl) throw new Error('Backend row missing');
        const row = rowEl.getBoundingClientRect();
        const escaped = [...panel.querySelectorAll('input, select, button')]
          .filter((el) => el.checkVisibility())
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.left < bounds.left || r.right > bounds.right;
          })
          .map((el) => el.getAttribute('aria-label') ?? el.tagName);
        return { right: bounds.right, rowRight: row.right, escaped };
      });
      expect(layout.right, `${width} ${id}: full row width`).toBeCloseTo(layout.rowRight, 0);
      expect(layout.escaped, `${width} ${id}: controls fit`).toEqual([]);
      await card.locator(':scope > summary').click();
    }
  }
});
