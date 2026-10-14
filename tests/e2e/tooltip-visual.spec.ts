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

// Cross-Chromium pixel diffs flake on font hinting, so assert layout numbers instead.

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const TOOLTIP_MAX_WIDTH = 400;

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
    contextEnabled: true,
    pageContextLevel: 'rich',
    shortcut: 'Ctrl+Shift+L',
  });
  mockAnthropic(ext.context, {
    translation:
      'Welcome, how are you? This translation is intentionally long to exercise the width clamp and line wrapping behavior inside the tooltip body when the tooltip is sitting next to a ContextPreview with page URL and selection snippet.',
    confidence: 0.95,
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('tooltip stays within its max-width clamp', async () => {
  const { page } = await openTooltip();

  const rect = await egaTest<Rect>(page, 'tooltipRect');
  expect(rect).not.toBeNull();
  if (!rect) throw new Error('tooltipRect missing');

  // 2px covers sub-pixel layout.
  expect(rect.width).toBeLessThanOrEqual(TOOLTIP_MAX_WIDTH + 2);

  await page.screenshot({ path: 'reports/tooltip-visual.png', fullPage: true });

  // Opt-in LLM judge (EGA_LLM_JUDGE=1); throws only on major-severity verdicts.
  const { judgeOrThrow } = await import('./_llm-judge');
  await judgeOrThrow(page, 'tooltip-visual');
});

test('tooltip clamps to the viewport when ContextPreview expands, and opens above a selection near the bottom', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/selection-page.html`);
  await waitForTestHooks(page);
  // A spacer pushes the paragraph to the bottom so the tooltip has to flip above it.
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = `${window.innerHeight - 80}px`;
    const arabizi = document.getElementById('arabizi');
    arabizi?.parentElement?.insertBefore(spacer, arabizi);
    arabizi?.scrollIntoView({ block: 'end' });
  });
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await expect
    .poll(async () => (await egaTest<string>(page, 'tooltipBody')) ?? '', { timeout: 10_000 })
    .toContain('Welcome');

  // The shadow root is closed, so page.evaluate cannot reach inside it.
  await egaTest(page, 'expandTooltipContextPreview');

  interface OverflowGeometry {
    tipTop: number;
    tipBottom: number;
    tipHeight: number;
    innerHeight: number;
    selectionTop: number | null;
    selectionBottom: number | null;
    ddOverflow: Array<{ scrollWidth: number; offsetWidth: number }>;
  }
  // Before the ResizeObserver tick the geometry still shows the pre-expansion layout.
  await expect
    .poll(
      async () => {
        const g = await egaTest<OverflowGeometry>(page, 'tooltipOverflowGeometry');
        if (!g) return false;
        return g.tipBottom <= g.innerHeight - 20 + 2;
      },
      { timeout: 5_000, message: 'waiting for tooltip to settle inside viewport' },
    )
    .toBe(true);
  const geometry = await egaTest<OverflowGeometry>(page, 'tooltipOverflowGeometry');
  expect(geometry).not.toBeNull();
  if (!geometry) throw new Error('geometry missing');

  const heightBudget = Math.min(geometry.innerHeight * 0.8, 600);
  expect(geometry.tipHeight).toBeLessThanOrEqual(heightBudget + 2);

  // Long URLs must wrap inside the card, not spill out of it; an empty list would check nothing.
  expect(geometry.ddOverflow.length).toBeGreaterThan(0);
  for (const dd of geometry.ddOverflow) {
    expect(dd.scrollWidth).toBeLessThanOrEqual(dd.offsetWidth + 2);
  }

  // The selection sits near the bottom, so the tooltip must open above it.
  if (geometry.selectionTop !== null) {
    expect(geometry.tipTop).toBeLessThan(geometry.selectionTop);
  }
  expect(geometry.tipBottom).toBeLessThanOrEqual(geometry.innerHeight - 20 + 2);

  await page.screenshot({
    path: 'reports/tooltip-visual-overflow.png',
    fullPage: false,
  });
});
