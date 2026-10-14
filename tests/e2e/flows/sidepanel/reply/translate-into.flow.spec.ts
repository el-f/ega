/* coverage: sidepanel.reply.translate-into */
import { test, expect, type BrowserContext } from '@playwright/test';
import {
  launchExtension,
  newestReply,
  openReplyMenu,
  seedSettings,
  sendFromPanel,
  setNextMessage,
  type ExtensionHandle,
} from '../../../helpers';
import { createTimeline, sseOk } from '../../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
    contextEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

/** Answers each call with the next text in order and keeps every request body. */
async function routeAnswers(context: BrowserContext, answers: string[]): Promise<string[]> {
  const bodies: string[] = [];
  await context.route('https://api.anthropic.com/v1/messages', async (route) => {
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body: sseOk(answers[bodies.length - 1] ?? 'x'),
    });
  });
  return bodies;
}

test('Translate into another language adds a version of the same reply in that language', async () => {
  const timeline = createTimeline();
  const bodies = await routeAnswers(ext.context, ['Hello there.', 'Bonjour.']);
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(sp, 'hola');
  const reply = newestReply(sp);
  await expect(reply.locator('.ega-answer')).toContainText('Hello there.', { timeout: 10_000 });
  timeline.markStep('first-answer');

  // The composer target is the reply's own language, so the menu offers only "another language".
  const menu = await openReplyMenu(sp, 'refine');
  await expect(menu.locator('[data-ega-translate-into]')).toHaveCount(0);
  await menu.locator('[data-ega-translate-into-other]').click();
  const pop = sp.getByRole('dialog', { name: 'Translate into' });
  await expect(pop).toBeVisible();
  const select = pop.getByLabel('Language');
  // It starts on the composer target, so Translate is always ready.
  await expect(select).toHaveValue('en');
  await select.selectOption('fr');
  await pop.locator('[data-ega-translate-into-run]').click();
  timeline.markStep('translate-into-run');

  await expect(reply.locator('.ega-pager-count')).toHaveText('2/2', { timeout: 10_000 });
  await expect(reply.locator('.ega-answer')).toContainText('Bonjour.');
  await expect(sp.locator('[data-ega-user-turn]')).toHaveCount(1);
  expect(bodies).toHaveLength(2);
  expect(bodies[1] ?? '').toMatch(/French/);
  timeline.markStep('version-in-french');

  // Version 1 is still the English answer.
  await reply.locator('[data-ega-variant-prev]').click();
  await expect(reply.locator('.ega-pager-count')).toHaveText('1/2');
  await expect(reply.locator('.ega-answer')).toContainText('Hello there.');
});

test('a composer target that differs from the reply is one pick away', async () => {
  const bodies = await routeAnswers(ext.context, ['Hello there.', 'Hallo.']);
  const sp = await ext.context.newPage();
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sendFromPanel(sp, 'hola');
  const reply = newestReply(sp);
  await expect(reply.locator('.ega-answer')).toContainText('Hello there.', { timeout: 10_000 });

  // Changing the composer target re-runs nothing by itself.
  await setNextMessage(sp, { target: 'de' });
  expect(bodies).toHaveLength(1);

  const menu = await openReplyMenu(sp, 'refine');
  const into = menu.locator('[data-ega-translate-into="de"]');
  await expect(into).toHaveText('Translate into German');
  await into.click();
  await expect(reply.locator('.ega-pager-count')).toHaveText('2/2', { timeout: 10_000 });
  await expect(reply.locator('.ega-answer')).toContainText('Hallo.');
  expect(bodies).toHaveLength(2);
  expect(bodies[1] ?? '').toMatch(/German/);
});
