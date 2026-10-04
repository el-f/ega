import { defineConfig } from '@playwright/test';

// Capture-only specs assert nothing; a CLI file filter cannot bypass testIgnore, so naming one on the command line lifts the ignore here.
const CAPTURE_SPECS = ['screenshot-audit', 'showcase', 'visual-journeys'];
const captureSpecNamed = process.argv
  .slice(2)
  .some((arg) => CAPTURE_SPECS.some((spec) => arg.includes(spec)));

// MV3 loads only under launchPersistentContext, which each spec calls: no webServer, no launchOptions, one worker.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  // A safety net, not a known flake: a pass on retry is reported "flaky" and is a bug to chase.
  retries: 1,
  // Baselines are keyed by platform; only linux and win32 are committed.
  snapshotPathTemplate:
    '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-platform}{ext}',
  // Any other platform skips the pixel compare rather than writing a baseline nobody reviewed.
  ignoreSnapshots: process.platform !== 'linux' && process.platform !== 'win32',
  // A missing baseline fails instead of being written, then passing on the retry. CLI --update-snapshots still wins.
  updateSnapshots: 'none',
  reporter: [
    ['list'],
    ...(process.env['CI'] ? [['github'] as const] : []),
    ...(process.env['EGA_UX_RECORD'] === '1'
      ? [['./scripts/ux-judge/journey-reporter.ts'] as const]
      : []),
  ],
  globalSetup: './tests/e2e/globalSetup.ts',
  testIgnore:
    captureSpecNamed || process.env['EGA_E2E_CAPTURE']
      ? []
      : CAPTURE_SPECS.map((spec) => `**/${spec}.spec.ts`),
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-extension',
    },
  ],
});
