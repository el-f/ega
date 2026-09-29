import { test, expect, type Page } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from './helpers';
import type { Settings } from '../../src/shared/types';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});
test.afterEach(async () => {
  await ext.close();
});

async function openTemplates(): Promise<Page> {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('button[data-tooltip="Templates"]').click();
  return page;
}

async function selectTaskLeaf(page: Page, task: string): Promise<void> {
  // Templates uses a chip strip; click the chip whose data-ega-workbench-chip matches.
  await page.locator(`[data-ega-workbench-chip="${task}"]`).first().click();
}

async function fillTemplate(page: Page, wrapperSelector: string, value: string): Promise<void> {
  const ta = page.locator(`${wrapperSelector} textarea`).first();
  await ta.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await ta.pressSequentially(value);
}

test('Templates chip strip exposes a chip per task', async () => {
  const page = await openTemplates();
  for (const t of ['translate', 'explain', 'summarize', 'reword', 'grammar', 'suggest-replies']) {
    await expect(page.locator(`[data-ega-workbench-chip="${t}"]`)).toBeVisible();
  }
});

test('editing a Reword template persists to storage', async () => {
  const page = await openTemplates();
  await selectTaskLeaf(page, 'reword');

  // Wrapper preserves data-ega-task-tab; editor mounts inside.
  await expect(page.locator('[data-ega-task-tab-wrapper="reword"]')).toBeVisible({
    timeout: 5_000,
  });

  await fillTemplate(
    page,
    '[data-ega-task-tab-wrapper="reword"] [data-ega-template-system]',
    'CUSTOM REWORD SYSTEM',
  );
  await fillTemplate(
    page,
    '[data-ega-task-tab-wrapper="reword"] [data-ega-template-user]',
    'CUSTOM REWORD USER {{text}}',
  );

  await page.locator('[data-ega-task-tab-wrapper="reword"] [data-ega-template-save]').click();

  await expect
    .poll(async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.advanced.taskTemplates.reword?.system;
    })
    .toBe('CUSTOM REWORD SYSTEM');
});

test('reset to inherited clears the override', async () => {
  const page = await openTemplates();
  await selectTaskLeaf(page, 'grammar');
  await expect(page.locator('[data-ega-task-tab-wrapper="grammar"]')).toBeVisible({
    timeout: 5_000,
  });

  await fillTemplate(
    page,
    '[data-ega-task-tab-wrapper="grammar"] [data-ega-template-system]',
    'TEMP_OVERRIDE_GRAMMAR',
  );
  await page.locator('[data-ega-task-tab-wrapper="grammar"] [data-ega-template-save]').click();

  await expect
    .poll(async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.advanced.taskTemplates.grammar?.system;
    })
    .toContain('TEMP_OVERRIDE_GRAMMAR');

  await page.locator('[data-ega-task-tab-wrapper="grammar"] [data-ega-template-reset]').click();
  await expect
    .poll(async () => {
      const s = await readStorage<Settings>(ext.context, ext.extensionId, 'ega.settings');
      return s?.advanced.taskTemplates.grammar;
    })
    .toBeUndefined();

  // Assert the visible textarea no longer contains the override after reset.
  const sysContent = page.locator(
    '[data-ega-task-tab-wrapper="grammar"] [data-ega-template-system] textarea',
  );
  await expect.poll(async () => sysContent.inputValue()).not.toContain('TEMP_OVERRIDE_GRAMMAR');
});

test('translate chip routes to the global editor (per-task surface skipped)', async () => {
  const page = await openTemplates();
  await selectTaskLeaf(page, 'translate');
  // Translate uses the global template, so its chip shows a redirect card instead of an editor.
  await expect(
    page.locator('text=Translate composes from the global Translate template'),
  ).toBeVisible({ timeout: 5_000 });
});
