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

test('meta chip (confidence + lang pill) sits on its own row, below the icon buttons', async () => {
  const { page } = await openTooltipWithPill();

  const geo = await egaTest<MetaGeometry>(page, 'tooltipMetaGeometry');
  expect(geo).not.toBeNull();
  if (!geo) throw new Error('tooltipMetaGeometry missing');

  expect(geo.metaParentClass.split(/\s+/)).not.toContain('actions');

  // `margin-left:auto` on the meta chip puts it on the icon flex line — this catches that.
  if (geo.firstIconRect) {
    const icon = geo.firstIconRect;
    const meta = geo.metaRect;
    const verticallySeparate =
      meta.top >= icon.bottom - 0.5 || // meta is below the icon row
      icon.top >= meta.bottom - 0.5; // or above (unusual but still separate)
    expect(verticallySeparate, 'meta chip must not share a flex row with icons').toBe(true);
  }
});

test('screenshot: tooltip with confidence pill for manual review', async () => {
  const { page } = await openTooltipWithPill();
  await page.screenshot({ path: 'reports/tooltip-pill.png', fullPage: true });

  // Opt-in LLM judge (EGA_LLM_JUDGE=1): pill layout can pass geometry checks and still look wrong.
  const { judgeOrThrow } = await import('./_llm-judge');
  await judgeOrThrow(page, 'tooltip-pill-layout');
});
