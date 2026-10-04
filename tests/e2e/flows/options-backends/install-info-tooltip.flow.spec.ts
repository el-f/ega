/* coverage: options.backends.install-info-tooltip */
import { test, expect } from '@playwright/test';
import { launchExtension, onlyBackends, seedSettings, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  // Enable native so its card sits at a stable position at the top of the list.
  await seedSettings(ext.context, ext.extensionId, {
    ...onlyBackends('native'),
  });
});

test.afterEach(async () => {
  await ext.close();
});

test('hovering the (i) icon on the native card reveals the install summary tooltip', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();

  const card = page.locator('details[data-backend-id="native"]');
  await expect(card).toBeVisible({ timeout: 5_000 });
  // Status row + (i) icon live inside the body — open the details.
  if (!(await card.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await card.locator('summary').first().click();
  }
  timeline.markStep('card-open');

  const infoTrigger = page.getByTestId('nh-install-info');
  await expect(infoTrigger).toBeVisible({ timeout: 5_000 });

  // The tooltip body MUST also be readable via the data-attr selector for
  // any consumer that wants the copy without hovering — kept as a contract.
  const inlineBody = await infoTrigger.getAttribute('data-ega-install-info');
  expect(inlineBody).toBeTruthy();
  expect(inlineBody).toContain('native messaging host');
  expect(inlineBody).toContain('Node.js');
  expect(inlineBody).toContain('manifest');
  expect(inlineBody).toContain('Uninstall');

  // Bits UI Tooltip opens only on a real pointerenter sequence; hover() alone is not enough.
  await page.mouse.move(0, 0);
  await infoTrigger.scrollIntoViewIfNeeded();
  await infoTrigger.evaluate((el) => {
    const target = el as HTMLElement;
    const rect = target.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerType: 'mouse',
    };
    target.dispatchEvent(new PointerEvent('pointerover', init));
    target.dispatchEvent(new PointerEvent('pointerenter', init));
    target.dispatchEvent(new MouseEvent('mouseover', init));
    target.dispatchEvent(new MouseEvent('mouseenter', init));
  });

  // Playwright's role lookup skips the closed instance, so target the portal class and filter by text.
  const tooltip = page.locator('.ega-tooltip-content').filter({ hasText: 'native messaging host' });
  await expect(tooltip).toBeVisible({ timeout: 5_000 });
  timeline.markStep('tooltip-open');

  const visibleBody = (await tooltip.textContent())?.trim() ?? '';
  expect(visibleBody).toContain('Node.js');
  expect(visibleBody).toContain('manifest');
  expect(visibleBody).toContain('Uninstall');
});
