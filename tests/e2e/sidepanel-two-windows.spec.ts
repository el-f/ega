import { test, expect, type Page } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from './helpers';

// Stand-in for two Chrome windows: two panel pages in one window, so per-window tab following is untested.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, { anthropicApiKey: 'sk-test', streaming: true });
});

test.afterEach(async () => {
  await ext.close();
});

async function openPanel(): Promise<Page> {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor();
  return page;
}

test('a send, a delete and its Undo in one panel all reach the other', async () => {
  mockAnthropic(ext.context, { translation: 'Hello, my friend', delayMs: 1_000 });
  const a = await openPanel();
  const b = await openPanel();

  await a.locator('#sp-text').fill('marhaba ya sadiqi');
  await a.locator('#sp-text').press('Enter');
  // B adopts A's turn and then A's finished answer, with no reload.
  await expect(b.locator('.ega-user-turn')).toContainText('marhaba ya sadiqi');
  await expect(b.locator('[data-ega-reply]')).toContainText('Hello, my friend', {
    timeout: 10_000,
  });
  await expect(a.locator('[data-ega-reply]')).toContainText('Hello, my friend');

  // Delete sits in the message's More menu, which opens in a layer outside the message.
  const userTurn = b.locator('.ega-user-turn').first();
  await userTurn.hover();
  await userTurn.locator('[data-ega-action="more"]').click();
  await b.locator('[data-ega-delete]').click();
  await expect(b.locator('.ega-user-turn')).toHaveCount(0);
  await expect(a.locator('.ega-user-turn')).toHaveCount(0);
  await expect(a.locator('[data-ega-reply]')).toHaveCount(0);

  await b.getByRole('button', { name: 'Undo' }).click();
  await expect(a.locator('.ega-user-turn')).toContainText('marhaba ya sadiqi');
  await expect(a.locator('[data-ega-reply]')).toContainText('Hello, my friend');
  await expect(b.locator('[data-ega-reply]')).toContainText('Hello, my friend');
});
