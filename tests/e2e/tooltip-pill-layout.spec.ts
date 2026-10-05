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

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface MetaGeometry {
  actionsRect: Rect | null;
  metaRect: Rect;
  firstIconRect: Rect | null;
  metaParentClass: string;
}

let ext: ExtensionHandle;

async function openTooltipWithPill(): Promise<{ page: Page }> {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');
  // The `done` chunk carrying the confidence pill lands after the body does.
  await expect
    .poll(async () => (await egaTest<MetaGeometry | null>(page, 'tooltipMetaGeometry')) !== null, {
      timeout: 5_000,
    })
    .toBe(true);
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
  mockAnthropic(ext.context, {
    translation: 'Welcome, how are you?',
    confidence: 0.95,
  });
});

test.afterEach(async () => {
  await ext.close();
});

// One action row: the pills end it, and wrap onto their own line only when the row is full.
test('meta chip (confidence + lang pill) ends the action row, right-aligned, never above the icons', async () => {
  const { page } = await openTooltipWithPill();

  const geo = await egaTest<MetaGeometry>(page, 'tooltipMetaGeometry');
  expect(geo).not.toBeNull();
  if (!geo) throw new Error('tooltipMetaGeometry missing');

  expect(geo.metaParentClass.split(/\s+/)).toContain('actions');
  if (!geo.actionsRect) throw new Error('actions row missing');
  // margin-left:auto pushes the pills to the row's right end; 0.5px covers sub-pixel rounding.
  expect(geo.metaRect.right).toBeLessThanOrEqual(geo.actionsRect.right + 0.5);
  expect(geo.actionsRect.right - geo.metaRect.right).toBeLessThan(1);
  if (geo.firstIconRect) {
    expect(geo.metaRect.top, 'meta chip must not sit above the icons').toBeGreaterThanOrEqual(
      geo.firstIconRect.top - 0.5,
    );
  }
});

test('screenshot: tooltip with confidence pill for manual review', async () => {
  const { page } = await openTooltipWithPill();
  await page.screenshot({ path: 'reports/tooltip-pill.png', fullPage: true });

  // Opt-in LLM judge (EGA_LLM_JUDGE=1): pill layout can pass geometry checks and still look wrong.
  const { judgeOrThrow } = await import('./_llm-judge');
  await judgeOrThrow(page, 'tooltip-pill-layout');
});
