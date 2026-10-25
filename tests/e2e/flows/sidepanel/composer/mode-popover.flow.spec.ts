/* coverage: sidepanel.composer.mode-popover */
import { test, expect, type Page } from '@playwright/test';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../../helpers';
import { createTimeline, expectCentered, expectSameWidth } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function openPanel(): Promise<Page> {
  const sp = await ext.context.newPage();
  await sp.setViewportSize({ width: 400, height: 760 });
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.locator('[data-ega-mode-chip]').waitFor({ state: 'visible', timeout: 5_000 });
  return sp;
}

test('the mode chip opens Next message, and each pick applies at once', async () => {
  const timeline = createTimeline();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    contextEnabled: true,
    pageContextLevel: 'minimal',
  });
  const sp = await openPanel();
  const chip = sp.locator('[data-ega-mode-chip]');
  await expect(chip).toHaveText('Translate → English');
  // The visible label starts the name, with the arrow read as "to".
  await expect(chip).toHaveAccessibleName('Translate to English, change task and language');

  await chip.click();
  const popover = sp.getByRole('dialog', { name: 'Next message' });
  await expect(popover).toBeVisible();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  timeline.markStep('popover-open');

  // A task pick applies at once and the popover stays open; Reword brings its tone row.
  // Unpicked chips hold the check's room as padding: no width change, no rewrap, no off-center label (R63).
  const reword = popover.locator('[data-ega-task="reword"]');
  const translate = popover.locator('[data-ega-task="translate"]');
  await expectCentered(reword, 'Reword unpicked');
  await expectSameWidth(
    translate,
    () =>
      expectSameWidth(
        reword,
        async () => {
          await reword.click();
          await expect(reword).toHaveAttribute('aria-checked', 'true');
        },
        'Reword picked',
      ),
    'Translate unpicked',
  );
  await expectCentered(translate, 'Translate unpicked');
  await expect(popover).toBeVisible();
  await expect(chip).toHaveText('Reword');
  const tone = popover.locator('[data-ega-tone-select]');
  await tone.selectOption('casual');
  await expect(chip.locator('[data-ega-user-name]')).toHaveText('Reword · Casual');
  timeline.markStep('task-and-tone');

  // Translate has no tone row; swap shows only once the source is a real language.
  await popover.locator('[data-ega-task="translate"]').click();
  await expect(tone).toHaveCount(0);
  await expect(popover.locator('[data-ega-swap]')).toHaveCount(0);
  await popover.locator('#sp-conv-source').selectOption('es');
  await expect(chip).toHaveText('Translate · Spanish → English');
  await popover.locator('[data-ega-swap]').click();
  await expect(popover.locator('#sp-conv-source')).toHaveValue('en');
  await expect(popover.locator('#sp-conv-target')).toHaveValue('es');
  await expect(chip).toHaveText('Translate · English → Spanish');
  timeline.markStep('languages-swapped');

  // The page info level is a Settings value: the pick is saved at once.
  // The unpicked level holds the check's room as padding, so a pick does not resize the group (R63).
  const rich = popover.getByRole('button', { name: 'Rich' });
  await expectCentered(rich, 'Rich unpicked');
  await expectSameWidth(
    popover.getByRole('button', { name: 'Minimal' }),
    () =>
      expectSameWidth(
        rich,
        async () => {
          await rich.click();
          await expect(rich).toHaveAttribute('aria-pressed', 'true');
        },
        'Rich picked',
      ),
    'Minimal unpicked',
  );
  await expectCentered(popover.getByRole('button', { name: 'Minimal' }), 'Minimal unpicked');
  await expect
    .poll(
      async () =>
        await sp.evaluate(async () => {
          const r = await chrome.storage.local.get('ega.settings');
          return (r['ega.settings'] as { pageContextLevel?: string }).pageContextLevel;
        }),
      { timeout: 5_000 },
    )
    .toBe('rich');
  timeline.markStep('page-level-saved');

  await sp.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(chip).toBeFocused();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  timeline.markStep('popover-closed');
});

test('with page info off in Settings the popover says so and links to Settings', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    contextEnabled: false,
  });
  const sp = await openPanel();
  await sp.locator('[data-ega-mode-chip]').click();
  const popover = sp.getByRole('dialog', { name: 'Next message' });
  await expect(popover.getByText('Page info is off.')).toBeVisible();
  await expect(popover.getByRole('button', { name: 'Rich' })).toHaveCount(0);

  const optionsPage = ext.context.waitForEvent('page', { timeout: 5_000 });
  await popover.getByRole('button', { name: 'Turn on in Settings' }).click();
  const opened = await optionsPage;
  expect(opened.url()).toContain('/src/options/index.html');
});
