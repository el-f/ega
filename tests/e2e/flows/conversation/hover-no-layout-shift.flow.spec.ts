/* coverage: translation.conversation.hover-no-layout-shift */
import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, seedSettings, type ExtensionHandle } from '../../helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    streaming: true,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('hovering a turn does not move any other turn', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  for (const text of ['marhaba sadiqi', 'kayf halak', 'shukran jazilan']) {
    await page.locator('#sp-text').fill(text);
    await page.locator('#sp-text').press('Enter');
    await expect(page.locator('.ega-answer').last()).toContainText('Welcome.', {
      timeout: 10_000,
    });
  }
  await expect(page.locator('.ega-user-turn')).toHaveCount(3, { timeout: 5_000 });

  // offset*, not client rects: hover() scrolls the target into view first.
  const geometry = async (): Promise<{ boxes: string; scrollHeight: number }> =>
    page.evaluate(() => {
      const stream = document.querySelector('.ega-conv-stream');
      const turns = [...document.querySelectorAll<HTMLElement>('.ega-user-turn, [data-ega-reply]')];
      return {
        boxes: turns.map((t) => `${t.offsetTop},${t.offsetHeight},${t.offsetWidth}`).join('|'),
        scrollHeight: stream?.scrollHeight ?? 0,
      };
    });

  const atRest = await geometry();

  for (const idx of [0, 1, 2]) {
    await page.locator('.ega-user-turn').nth(idx).hover();
    await expect(
      page.locator('.ega-user-turn').nth(idx).locator('[data-ega-user-toolbar]'),
    ).toHaveCSS('opacity', '1');
    expect(await geometry(), `hovering user turn ${idx} moved the stream`).toEqual(atRest);
  }

  const assistantTurns = await page.locator('[data-ega-reply]').count();
  for (let idx = 0; idx < assistantTurns; idx++) {
    await page.locator('[data-ega-reply]').nth(idx).hover();
    expect(await geometry(), `hovering assistant turn ${idx} moved the stream`).toEqual(atRest);
  }
});

test('the message toolbar shows on keyboard focus and moves no geometry', async () => {
  mockAnthropic(ext.context, { translation: 'Welcome.' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('#sp-text').fill('marhaba sadiqi');
  await page.locator('#sp-text').press('Enter');
  await expect(page.locator('.ega-answer').last()).toContainText('Welcome.', {
    timeout: 10_000,
  });

  const userTurn = page.locator('.ega-user-turn').first();
  const actions = userTurn.locator('[data-ega-user-toolbar]');
  // The toolbar floats over the bubble: it is hidden at rest and takes no room when it shows.
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS('opacity', '0');

  const size = async (): Promise<string> =>
    userTurn.evaluate((t: HTMLElement) => `${t.offsetTop},${t.offsetHeight},${t.offsetWidth}`);

  const before = await size();
  await userTurn.locator('[data-ega-copy-source]').focus();
  await expect(actions).toHaveCSS('opacity', '1');
  expect(await size()).toEqual(before);
});
