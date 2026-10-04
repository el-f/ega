// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { lintCoverage } from '../../../scripts/flow-coverage.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

function mkTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cov-'));
  fs.mkdirSync(path.join(dir, 'tests/e2e/flows/tooltip'), { recursive: true });
  return dir;
}

describe('flow-coverage lint', () => {
  it('passes when every action has >=1 flow file + matching marker', async () => {
    const dir = mkTmpRepo();
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/coverage.ts'),
      `export const COVERAGE = [{ id: 'translation', surfaces: [{ id: 'tooltip', actions: [{ id: 'copy', description: 'x', flows: ['tooltip/copy.flow.spec.ts'] }] }] }];`,
    );
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/tooltip/copy.flow.spec.ts'),
      `/* coverage: translation.tooltip.copy */\nimport { test } from '@playwright/test';\ntest('copy', async () => {});\n`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when the marker is not on line 1, where the journey reporter reads it', async () => {
    const dir = mkTmpRepo();
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/coverage.ts'),
      `export const COVERAGE = [{ id: 'translation', surfaces: [{ id: 'tooltip', actions: [{ id: 'copy', description: 'x', flows: ['tooltip/copy.flow.spec.ts'] }] }] }];`,
    );
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/tooltip/copy.flow.spec.ts'),
      `import { test } from '@playwright/test';\n/* coverage: translation.tooltip.copy */\ntest('copy', async () => {});\n`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/copy.flow.spec.ts: missing the coverage marker on line 1/);
  });

  it('fails when an action has no flows', async () => {
    const dir = mkTmpRepo();
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/coverage.ts'),
      `export const COVERAGE = [{ id: 'translation', surfaces: [{ id: 'tooltip', actions: [{ id: 'copy', description: 'x', flows: [] }] }] }];`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/translation.tooltip.copy.*no flows/);
  });

  it('fails when a referenced flow file does not exist', async () => {
    const dir = mkTmpRepo();
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/coverage.ts'),
      `export const COVERAGE = [{ id: 'translation', surfaces: [{ id: 'tooltip', actions: [{ id: 'copy', description: 'x', flows: ['tooltip/missing.flow.spec.ts'] }] }] }];`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/missing.flow.spec.ts.*does not exist/);
  });

  it('fails when a flow file is not referenced by any action (orphan)', async () => {
    const dir = mkTmpRepo();
    fs.writeFileSync(path.join(dir, 'tests/e2e/flows/coverage.ts'), `export const COVERAGE = [];`);
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/tooltip/orphan.flow.spec.ts'),
      `/* coverage: translation.tooltip.copy */\nimport { test } from '@playwright/test';\ntest('orphan', async () => {});\n`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/orphan.flow.spec.ts.*not referenced/);
  });

  it('skips underscore-prefixed dirs (harness + examples)', async () => {
    const dir = mkTmpRepo();
    fs.writeFileSync(path.join(dir, 'tests/e2e/flows/coverage.ts'), `export const COVERAGE = [];`);
    fs.mkdirSync(path.join(dir, 'tests/e2e/flows/_examples'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/_examples/demo.flow.spec.ts'),
      `import { test } from '@playwright/test';\ntest('demo', async () => {});\n`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when a flow file name is not its action id', async () => {
    const dir = mkTmpRepo();
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/coverage.ts'),
      `export const COVERAGE = [{ id: 'translation', surfaces: [{ id: 'tooltip', actions: [{ id: 'copy', description: 'x', flows: ['tooltip/copy-text.flow.spec.ts'] }] }] }];`,
    );
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/tooltip/copy-text.flow.spec.ts'),
      `/* coverage: translation.tooltip.copy */\nimport { test } from '@playwright/test';\ntest('copy', async () => {});\n`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'translation.tooltip.copy: tooltip/copy-text.flow.spec.ts must be copy.flow.spec.ts in one of tooltip/, translation-tooltip/, translation/tooltip/',
    ]);
  });

  it('fails when a flow file sits outside its surface dir', async () => {
    const dir = mkTmpRepo();
    fs.mkdirSync(path.join(dir, 'tests/e2e/flows/popup'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/coverage.ts'),
      `export const COVERAGE = [{ id: 'translation', surfaces: [{ id: 'tooltip', actions: [{ id: 'copy', description: 'x', flows: ['popup/copy.flow.spec.ts'] }] }] }];`,
    );
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/popup/copy.flow.spec.ts'),
      `/* coverage: translation.tooltip.copy */\nimport { test } from '@playwright/test';\ntest('copy', async () => {});\n`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(
      /popup\/copy.flow.spec.ts must be copy.flow.spec.ts in one of tooltip\//,
    );
  });

  it('accepts the <family>-<surface>/ and <family>/<surface>/ dir shapes', async () => {
    const dir = mkTmpRepo();
    fs.mkdirSync(path.join(dir, 'tests/e2e/flows/options-display'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests/e2e/flows/integration/handoff'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/coverage.ts'),
      `export const COVERAGE = [
        { id: 'options', surfaces: [{ id: 'display', actions: [{ id: 'mode-toggle', description: 'x', flows: ['options-display/mode-toggle.flow.spec.ts'] }] }] },
        { id: 'integration', surfaces: [{ id: 'handoff', actions: [{ id: 'stale', description: 'x', flows: ['integration/handoff/stale.flow.spec.ts'] }] }] },
      ];`,
    );
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/options-display/mode-toggle.flow.spec.ts'),
      `/* coverage: options.display.mode-toggle */\n`,
    );
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/integration/handoff/stale.flow.spec.ts'),
      `/* coverage: integration.handoff.stale */\n`,
    );
    const result = await lintCoverage(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when a flow file is missing the coverage marker', async () => {
    const dir = mkTmpRepo();
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/coverage.ts'),
      `export const COVERAGE = [{ id: 'translation', surfaces: [{ id: 'tooltip', actions: [{ id: 'copy', description: 'x', flows: ['tooltip/copy.flow.spec.ts'] }] }] }];`,
    );
    fs.writeFileSync(
      path.join(dir, 'tests/e2e/flows/tooltip/copy.flow.spec.ts'),
      `import { test } from '@playwright/test';\ntest('copy', async () => {});\n`,
    );
    const result = await lintCoverage(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/copy.flow.spec.ts: missing the coverage marker on line 1/);
  });
});
