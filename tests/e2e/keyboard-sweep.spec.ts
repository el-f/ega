import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  onlyBackends,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';
import { readFocus, type FocusStop } from './flows/_harness';
import { SETTINGS_TABS } from '../../src/shared/settings-tabs';

// Per surface: every Tab stop is visible with a ring, no stop repeats, and no positive tabindex reorders Tab.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    ...onlyBackends('anthropic'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

/** Tabs until focus leaves the page; a stop seen twice before that is a trap. */
async function sweep(page: Page, within?: string, maxStops = 250): Promise<FocusStop[]> {
  await page.evaluate(() => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    (el as HTMLElement | null)?.blur();
  });
  const stops: FocusStop[] = [];
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press('Tab');
    const marker = await page.evaluate(
      ({ n, scope }) => {
        let el: Element | null = document.activeElement;
        while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
        if (!el || el === document.body) return null;
        const root = el.getRootNode();
        const host = root instanceof ShadowRoot ? root.host : null;
        if (scope && !el.closest(scope) && !host?.closest(scope)) return 'outside';
        const prev = el.getAttribute('data-ks-stop');
        if (prev === null) el.setAttribute('data-ks-stop', String(n));
        return prev ?? 'new';
      },
      { n: i, scope: within ?? null },
    );
    if (marker === null) break;
    if (marker === 'outside') continue;
    const stop = await readFocus(page);
    if (!stop) break;
    if (marker !== 'new') {
      throw new Error(
        `focus came back to ${stop.name} (stop ${marker}) after ${stops.length} stops`,
      );
    }
    stops.push(stop);
  }
  return stops;
}

function expectAllVisibleWithRing(surface: string, stops: FocusStop[]): void {
  expect(stops.length, `${surface}: Tab reached nothing`).toBeGreaterThan(0);
  const noRing = stops.filter((s) => !s.ring).map((s) => s.name);
  const hidden = stops.filter((s) => !s.visible).map((s) => s.name);
  expect(noRing, `${surface}: focused with no visible ring`).toEqual([]);
  expect(hidden, `${surface}: focused while not visible`).toEqual([]);
}

async function expectNoPositiveTabindex(page: Page, surface: string): Promise<void> {
  const offenders = await page.evaluate(() => {
    const out: string[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const el of root.querySelectorAll('*')) {
        if (Number(el.getAttribute('tabindex')) > 0) out.push(el.outerHTML.slice(0, 80));
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    return out;
  });
  expect(offenders, `${surface}: a positive tabindex reorders Tab`).toEqual([]);
}

test('popup', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await expect(page.locator('.active-backend-chip')).toHaveAttribute('aria-label', /Anthropic/);
  await expectNoPositiveTabindex(page, 'popup');
  expectAllVisibleWithRing('popup', await sweep(page));
});

test('side panel, and Esc closes its backend popover', async () => {
  mockAnthropic(ext.context, { translation: 'Hello there' });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await page.locator('#sp-text').fill('marhaba');
  await page.locator('#sp-text').press('Enter');
  await expect(page.locator('.ega-answer').first()).toContainText('Hello there');
  await expectNoPositiveTabindex(page, 'side panel');
  expectAllVisibleWithRing('side panel', await sweep(page));

  const chip = page.locator('.active-backend-chip');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(chip).toBeFocused();
});

for (const tab of SETTINGS_TABS) {
  test(`options: ${tab.label} tab`, async () => {
    // A long tab is a hundred Tab presses, each read back twice.
    test.slow();
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
    await page.locator(`#tab-${tab.id}`).click();
    await expect(
      page.getByRole('tabpanel').getByRole('heading', { level: 1, name: tab.label, exact: true }),
    ).toBeVisible();
    await expectNoPositiveTabindex(page, `options ${tab.id}`);
    expectAllVisibleWithRing(`options ${tab.id}`, await sweep(page));
  });
}

test('options: Esc closes a task dialog and returns focus to its Edit button', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-tasks').click();
  const edit = page.locator('[data-ega-task-edit="explain"]');
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-ega-task-dialog="explain"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ega-task-dialog]')).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test('tooltip', async () => {
  await seedSettings(ext.context, ext.extensionId, {
    streaming: true,
    shortcut: 'Ctrl+Shift+L',
    tooltipClickOutside: false,
  });
  mockAnthropic(ext.context, { translation: 'Welcome' });
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await expect(page.locator('.tooltip .body')).toContainText('Welcome');
  await expectNoPositiveTabindex(page, 'tooltip');
  // The fixture page's own links share the Tab order; only the tooltip's stops are checked.
  expectAllVisibleWithRing('tooltip', await sweep(page, '#ega-shadow-host'));
});
