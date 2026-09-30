// Capture-only, no assertions: run `pnpm visual:journeys:capture`; a judge script grades the frames.
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { CONFIG } from '../../scripts/ux-judge/config';
import { launchExtension, type ExtensionHandle } from './helpers';

interface JourneyStep {
  label: string;
  /** Drive the UI for this step. The screenshot is taken right after it resolves. */
  run: (page: Page) => Promise<void>;
}

async function captureJourney(
  page: Page,
  coverage: string,
  steps: ReadonlyArray<JourneyStep>,
): Promise<void> {
  const dir = path.join(CONFIG.framesRoot, coverage.replace(/\./g, '--'));
  await fs.mkdir(dir, { recursive: true });
  const manifestSteps: Array<{ idx: number; label: string; frame: string }> = [];
  for (const [i, step] of steps.entries()) {
    await step.run(page);
    const frame = `${String(i).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(dir, frame), fullPage: true });
    manifestSteps.push({ idx: i, label: step.label, frame });
  }
  await fs.writeFile(
    path.join(dir, 'journey.json'),
    JSON.stringify({ coverage, steps: manifestSteps }, null, 2),
  );
}

let ext: ExtensionHandle;
test.beforeEach(async () => {
  ext = await launchExtension();
});
test.afterEach(async () => {
  await ext.close();
});

test('journey: options.context-menu.manage', async () => {
  const page = await ext.context.newPage();
  await captureJourney(page, 'options.context-menu.manage', [
    {
      label: 'Open Options (Translate tab) and scroll to the Context menu card',
      run: async (p) => {
        await p.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
        await p
          .locator('[data-ega-cm-layout]')
          .first()
          .waitFor({ state: 'visible', timeout: 8_000 });
        await p.locator('[data-ega-cm-layout]').first().scrollIntoViewIfNeeded();
      },
    },
    {
      label: 'Switch the layout to Flat',
      run: async (p) => {
        await p.locator('[data-ega-cm-layout] [role="radio"][data-value="flat"]').click();
      },
    },
    {
      label: 'Add an image action',
      run: async (p) => {
        await p.locator('[data-ega-cm-add-image]').click();
      },
    },
    {
      label: 'Reset the section back to defaults',
      run: async (p) => {
        await p.locator('[data-ega-section-reset]').first().click();
      },
    },
  ]);
});

test('journey: translation.sidepanel.input-send', async () => {
  const page = await ext.context.newPage();
  await captureJourney(page, 'translation.sidepanel.input-send', [
    {
      label: 'Open the side panel (empty state)',
      run: async (p) => {
        await p.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
        await p.locator('#sp-text').waitFor({ state: 'visible', timeout: 8_000 });
      },
    },
    {
      label: 'Type a phrase into the composer',
      run: async (p) => {
        await p.locator('#sp-text').fill('habibi let us go');
      },
    },
    {
      label: 'Toggle streaming off',
      run: async (p) => {
        await p.locator('.ega-streaming-toggle').click();
      },
    },
  ]);
});
