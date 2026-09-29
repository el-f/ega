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
    expect(result.errors[0]).toMatch(/copy.flow.spec.ts.*missing coverage marker/);
  });
});
