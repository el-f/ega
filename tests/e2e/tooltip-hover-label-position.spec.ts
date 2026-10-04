import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

let ext: ExtensionHandle;

async function openTooltip(): Promise<{ page: Page }> {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');
  return { page };
}

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'test-key',
    streaming: true,
    tooltipClickOutside: false,
    contextEnabled: false,
    shortcut: 'Ctrl+Shift+L',
  });
  mockAnthropic(ext.context, { translation: 'Welcome, how are you?' });
});

test.afterEach(async () => {
  await ext.close();
});

interface HoverGeo {
  bodyBottom: number;
  bodyTop: number;
  btnTop: number;
  btnBottom: number;
  topRule: string | null;
  bottomRule: string | null;
}

test('icon-button hover label sits below the icon, not overlapping the body', async () => {
  const { page } = await openTooltip();

  const geo = await egaTest<HoverGeo>(page, 'tooltipHoverLabelGeometry');

  expect(geo).not.toBeNull();
  if (!geo) throw new Error('tooltip geometry unavailable');

  // The 4px slack absorbs sub-pixel layout.
  expect(geo.btnTop).toBeGreaterThanOrEqual(geo.bodyBottom - 4);

  // `100%` and `anchor(bottom)` both put the label below the button; `anchor(top)` overlaps it.
  expect(geo.topRule).toMatch(/100%|anchor\(bottom\)/);
  expect(geo.topRule).not.toMatch(/anchor\(top\)|^auto$/);
  if (geo.bottomRule) {
    expect(geo.bottomRule).not.toMatch(/anchor\(top\)/);
  }

  // Full-page capture — the tooltip lives in a closed shadow root and cannot be shot alone.
  await page.screenshot({ path: 'reports/tooltip-hover.png', fullPage: true });
});
