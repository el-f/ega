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
  // Unpicked chips hold the check's room at both ends: no width change, no rewrap, no off-center label (R63).
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

  // Translate has no tone row. On Auto-detect swap stays a Tab stop, off, with its reason, and a press does nothing.
  await popover.locator('[data-ega-task="translate"]').click();
  await expect(tone).toHaveCount(0);
  const source = popover.locator('#sp-conv-source');
  const target = popover.locator('#sp-conv-target');
  const swap = popover.locator('[data-ega-swap]');
  await expect(source).toHaveValue('auto');
  await source.focus();
  await sp.keyboard.press('Tab');
  await expect(swap).toBeFocused();
  await expect(swap).toHaveAttribute('aria-disabled', 'true');
  // The reason is read once, as the description; a tooltip opened by focus would add a second copy.
  await expect(swap).toHaveAccessibleName('Swap languages');
  await sp.waitForTimeout(600); // past the tooltip's open delay
  await expect(swap).toHaveAccessibleDescription('Swap needs a reply to detect its language');
  await expect(popover.getByText('Swap needs a reply to detect its language')).toBeVisible();
  await sp.keyboard.press('Enter');
  await sp.keyboard.press('Space');
  await swap.click({ force: true }); // force: Playwright waits for an aria-disabled button to turn on
  await expect(source).toHaveValue('auto');
  await expect(target).toHaveValue('en');
  await expect(chip).toHaveText('Translate → English');
  timeline.markStep('swap-off-on-auto');

  await source.selectOption('es');
  await expect(chip).toHaveText('Translate · Spanish → English');
  await expect(swap).not.toHaveAttribute('aria-disabled');
  await expect(swap).toHaveAccessibleName('Swap languages');
  await expect(swap).not.toHaveAttribute('aria-describedby');
  await expect(popover.getByText('Swap needs a reply to detect its language')).toHaveCount(0);
  await swap.click();
  await expect(popover.locator('#sp-conv-source')).toHaveValue('en');
  await expect(popover.locator('#sp-conv-target')).toHaveValue('es');
  await expect(chip).toHaveText('Translate · English → Spanish');
  timeline.markStep('languages-swapped');

  // The page info level is a Settings value: the pick is saved at once.
  // The unpicked level holds the check's room at both ends, so a pick does not resize the group (R63).
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

// R9: at 320-400px no select in the popover is cut; To once fell to 34px. R63: From and To keep their box when Swap turns off.
test('every popover select fits its picked name at 320 and 400 px, and From and To never move', async () => {
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-test' });
  const seeder = await ext.context.newPage();
  await seeder.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await seeder.evaluate(async () => {
    const at = Date.now();
    await chrome.storage.local.set({
      'ega.customLanguages': [
        { id: 'arabizi-lev', label: 'Arabizi (Levantine)', hint: '', examples: [], createdAt: at },
        { id: 'pt-br', label: 'Portuguese (Brazil)', hint: '', examples: [], createdAt: at },
      ],
    });
  });
  await seeder.close();
  const sp = await openPanel();
  await sp.locator('[data-ega-mode-chip]').click();
  const popover = sp.locator('[data-ega-mode-popover]');
  await popover.locator('#sp-conv-target').selectOption('pt-br');

  const cut = (): Promise<string[]> =>
    popover.locator('select').evaluateAll((selects) => {
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      return selects.flatMap((s) => {
        const select = s as HTMLSelectElement;
        const css = getComputedStyle(select);
        ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
        const label = select.selectedOptions[0]?.textContent ?? '';
        const room =
          select.clientWidth -
          Number.parseFloat(css.paddingLeft) -
          Number.parseFloat(css.paddingRight);
        const need = ctx.measureText(label).width;
        return select.scrollWidth > select.clientWidth || need > room
          ? [`#${select.id} "${label}": needs ${Math.ceil(need)}px, has ${Math.floor(room)}px`]
          : [];
      });
    });

  for (const width of [320, 400]) {
    await sp.setViewportSize({ width, height: 760 });
    // A resize can close the popover.
    if ((await popover.count()) === 0) await sp.locator('[data-ega-mode-chip]').click();
    const boxes: Record<string, string> = {};
    for (const [task, source] of [
      ['translate', 'auto'],
      ['translate', 'arabizi-lev'],
      ['reword', 'arabizi-lev'],
    ] as const) {
      await popover.locator(`[data-ega-task="${task}"]`).click();
      await popover.locator('#sp-conv-source').selectOption(source);
      const swap = popover.locator('[data-ega-swap]');
      await expect(swap).toBeVisible();
      if (source === 'auto') await expect(swap).toHaveAttribute('aria-disabled', 'true');
      else await expect(swap).not.toHaveAttribute('aria-disabled');
      expect.soft(await cut(), `${task}, From ${source}, at ${width}px`).toEqual([]);
      if (task === 'translate') {
        // Two frames: the popover takes its new place on the frame after its content changes height.
        await sp.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        // Height above the chip: at 320 px the longer chip label wraps and moves the chip itself.
        const chipTop = (await sp.locator('[data-ega-mode-chip]').boundingBox())?.y ?? Number.NaN;
        const at = await Promise.all(
          ['#sp-conv-source', '#sp-conv-target'].map(async (id) => {
            const b = await popover.locator(id).boundingBox();
            return `${id} x=${b?.x} w=${b?.width} above chip=${chipTop - (b?.y ?? Number.NaN)}`;
          }),
        );
        boxes[source] = at.join(', ');
      }
    }
    // R63: Swap stays in its column and its reason line keeps its height, so From and To keep their box.
    expect.soft(boxes['auto'], `From and To at ${width}px`).toBe(boxes['arabizi-lev']);
  }
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
