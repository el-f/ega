import { test, expect, type Page } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from './helpers';

// jsdom computes no layout, so these run against the live Options page in real Chromium.

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

async function openOptions(): Promise<Page> {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await expect(page.locator('[role="tablist"]').first()).toBeVisible({ timeout: 10_000 });
  return page;
}

test('Input leading icon is left of input text area', async () => {
  const page = await openOptions();

  await page.keyboard.press('Control+,');
  const searchInput = page.getByPlaceholder(/Search settings/i);
  await expect(searchInput).toBeVisible({ timeout: 5_000 });

  const geometry = await page.evaluate((): { leading: Rect | null; input: Rect | null } => {
    const row = document.querySelector('.ega-input-row');
    if (!row) return { leading: null, input: null };
    const leadingEl = row.querySelector('.ega-input-leading');
    const inputEl = row.querySelector('.ega-input');
    if (!leadingEl || !inputEl) return { leading: null, input: null };
    const lr = leadingEl.getBoundingClientRect();
    const ir = inputEl.getBoundingClientRect();
    return {
      leading: {
        left: lr.left,
        top: lr.top,
        right: lr.right,
        bottom: lr.bottom,
        width: lr.width,
        height: lr.height,
      },
      input: {
        left: ir.left,
        top: ir.top,
        right: ir.right,
        bottom: ir.bottom,
        width: ir.width,
        height: ir.height,
      },
    };
  });

  expect(geometry.leading, '.ega-input-leading not found').not.toBeNull();
  expect(geometry.input, '.ega-input not found').not.toBeNull();

  if (geometry.leading && geometry.input) {
    expect(
      geometry.leading.right,
      `leading icon right (${geometry.leading.right}) must not exceed input left (${geometry.input.left})`,
    ).toBeLessThanOrEqual(geometry.input.left + 2); // 2px sub-pixel tolerance
  }
});

test('Input text area starts after leading icon', async () => {
  const page = await openOptions();

  await page.keyboard.press('Control+,');
  const searchInput = page.getByPlaceholder(/Search settings/i);
  await expect(searchInput).toBeVisible({ timeout: 5_000 });

  await searchInput.type('a');

  const geometry = await page.evaluate((): { leading: Rect | null; input: Rect | null } => {
    const row = document.querySelector('.ega-input-row');
    if (!row) return { leading: null, input: null };
    const leadingEl = row.querySelector('.ega-input-leading');
    const inputEl = row.querySelector('.ega-input');
    if (!leadingEl || !inputEl) return { leading: null, input: null };
    const lr = leadingEl.getBoundingClientRect();
    const ir = inputEl.getBoundingClientRect();
    return {
      leading: {
        left: lr.left,
        top: lr.top,
        right: lr.right,
        bottom: lr.bottom,
        width: lr.width,
        height: lr.height,
      },
      input: {
        left: ir.left,
        top: ir.top,
        right: ir.right,
        bottom: ir.bottom,
        width: ir.width,
        height: ir.height,
      },
    };
  });

  if (geometry.leading && geometry.input) {
    expect(
      geometry.input.left,
      `input left (${geometry.input.left}) must be >= leading icon right (${geometry.leading.right})`,
    ).toBeGreaterThanOrEqual(geometry.leading.right - 2);
  }
});

// The 4px floor comes from the Button CSS gap: var(--space-2).
test('Button leading icon is separated from label by gap >= 4px', async () => {
  const page = await openOptions();

  await page.locator('button[data-tooltip="Advanced"]').click();
  const dataTab = page.locator('[data-ega-subtab="data"]');
  if ((await dataTab.count()) > 0) {
    await dataTab.click();
  }

  const hasActionButton = await page.evaluate(
    (): boolean => document.querySelector('button [data-action-icon]') !== null,
  );
  expect(hasActionButton).toBe(true);

  const geometry = await page.evaluate((): { icon: Rect | null; label: Rect | null } => {
    const iconEl = document.querySelector('button [data-action-icon]');
    if (!iconEl) return { icon: null, label: null };
    const btn = iconEl.closest('button');
    if (!btn) return { icon: null, label: null };
    const labelEl = btn.querySelector('.ega-btn-label');
    if (!labelEl) return { icon: null, label: null };
    const ir = iconEl.getBoundingClientRect();
    const lr = labelEl.getBoundingClientRect();
    return {
      icon: {
        left: ir.left,
        top: ir.top,
        right: ir.right,
        bottom: ir.bottom,
        width: ir.width,
        height: ir.height,
      },
      label: {
        left: lr.left,
        top: lr.top,
        right: lr.right,
        bottom: lr.bottom,
        width: lr.width,
        height: lr.height,
      },
    };
  });

  const { icon, label } = geometry;
  if (!icon || !label) throw new Error('action button has no icon or label element');
  expect(
    icon.right,
    `button icon right (${icon.right}) must be left of label left (${label.left})`,
  ).toBeLessThan(label.left);

  expect(
    label.left - icon.right,
    'gap between button icon and label must be >= 4px',
  ).toBeGreaterThanOrEqual(4);
});

test('Select chevron is within select row bounds', async () => {
  const page = await openOptions();

  const translateTab = page.locator('button[data-tooltip="Translate"]');
  await translateTab.click();
  await expect(translateTab).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });

  const hasSelect = await page.evaluate(
    (): boolean => document.querySelector('.ega-select') !== null,
  );
  expect(hasSelect).toBe(true);

  // The chevron is a no-repeat background image: it cannot leave the box, only run under the option text.
  const chevron = await page
    .locator('.ega-select')
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        image: cs.backgroundImage,
        repeat: cs.backgroundRepeat,
        positionX: cs.backgroundPositionX,
        width: Number.parseFloat(cs.backgroundSize),
        paddingRight: Number.parseFloat(cs.paddingRight),
      };
    });
  expect(chevron.image).toContain('svg');
  expect(chevron.repeat).toBe('no-repeat');
  const inset = Number(/(\d+(?:\.\d+)?)px/.exec(chevron.positionX)?.[1]);
  expect(inset, `chevron inset from ${chevron.positionX}`).toBeGreaterThanOrEqual(0);
  expect(
    chevron.paddingRight,
    `select right padding (${chevron.paddingRight}) must clear the chevron (${inset} + ${chevron.width})`,
  ).toBeGreaterThanOrEqual(inset + chevron.width);
});

test('side panel header stays on one row at the widths Chrome opens it at', async () => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  const header = page.locator('.sp-header');
  await expect(header).toBeVisible({ timeout: 10_000 });
  for (const width of [400, 360]) {
    await page.setViewportSize({ width, height: 700 });
    const rows = await header.evaluate((el) => {
      const tops = Array.from(el.children)
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map((r) => Math.round(r.top + r.height / 2));
      return new Set(tops.map((t) => Math.round(t / 8))).size;
    });
    expect(rows, `header controls at ${width}px sit on ${rows} rows`).toBe(1);
    const overflow = await header.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, `header overflows by ${overflow}px at ${width}px`).toBeLessThanOrEqual(0);
  }
});
