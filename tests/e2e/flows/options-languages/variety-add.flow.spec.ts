/* coverage: options.languages.variety-add */
import { test, expect } from '@playwright/test';
import { launchExtension, readStorage, type ExtensionHandle } from '../../helpers';
import { createTimeline } from '../_harness';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

test('Add custom language form seeds a new entry in storage', async () => {
  const timeline = createTimeline();
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-languages').click();

  // Open add form. The "Add custom language" + IconButton header action
  // mounts the form fields. Form starts collapsed.
  await page.locator('button[aria-label="Add custom language"]').click();
  timeline.markStep('form-opened');

  // Label input went through the shared `<Input>` primitive which generates
  // a UUID-style id; bind via the <label>'s `for` association instead.
  await page.getByLabel('Label').fill('TestPidgin');
  await page.locator('#new-hint').fill('A test variety hint that is long enough.');
  await page.locator('button.ega-btn.variant-primary', { hasText: 'Add' }).click();
  timeline.markStep('submitted');

  // customLanguages stored under its own key (not on settings). Wait for
  // a non-empty entry matching our label.
  await expect
    .poll(
      async () => {
        const customs = await readStorage<unknown>(
          ext.context,
          ext.extensionId,
          'ega.customLanguages',
        );
        if (!Array.isArray(customs)) return false;
        return customs.some((c) => (c as { label?: string }).label === 'TestPidgin');
      },
      { timeout: 5_000 },
    )
    .toBe(true);
});
