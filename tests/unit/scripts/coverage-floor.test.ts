// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkFloor,
  missingSpecs,
  percent,
  toRepoPath,
  FLOOR,
  EXCEPTIONS,
} from '../../../scripts/coverage-floor.js';

const FULL = {
  lines: { pct: 100 },
  statements: { pct: 100 },
  functions: { pct: 100 },
  branches: { pct: 100 },
};
const BARE = {
  lines: { pct: 5 },
  statements: { pct: 5 },
  functions: { pct: 0 },
  branches: { pct: 0 },
};

describe('toRepoPath', () => {
  it('normalizes an absolute Windows key to a repo-relative src path', () => {
    expect(toRepoPath('C:\\Projects\\ega\\src\\shared\\storage.ts')).toBe('src/shared/storage.ts');
  });

  it('normalizes an absolute POSIX key', () => {
    expect(toRepoPath('/home/x/ega/src/content/index.ts')).toBe('src/content/index.ts');
  });
});

describe('checkFloor', () => {
  it('passes when every file clears the floor', () => {
    const r = checkFloor({ 'a/src/x.ts': FULL }, {}, FLOOR);
    expect(r.belowFloor).toEqual([]);
    expect(r.staleExceptions).toEqual([]);
    expect(r.checked).toBe(1);
  });

  it('reports each metric a file misses', () => {
    const r = checkFloor({ 'a/src/x.ts': BARE }, {}, FLOOR);
    expect(r.belowFloor.map((b) => b.metric).sort()).toEqual([
      'branches',
      'functions',
      'lines',
      'statements',
    ]);
    expect(r.belowFloor[0]?.file).toBe('src/x.ts');
  });

  it('lets a listed exception stay below the floor on the metrics it names', () => {
    const r = checkFloor(
      { 'a/src/x.ts': BARE },
      { 'src/x.ts': { metrics: ['lines', 'statements', 'functions', 'branches'], reason: 'e2e' } },
      FLOOR,
    );
    expect(r.belowFloor).toEqual([]);
    expect(r.staleExceptions).toEqual([]);
  });

  it('still fails a listed file on a metric its exception does not name', () => {
    const r = checkFloor(
      { 'a/src/x.ts': BARE },
      { 'src/x.ts': { metrics: ['functions'], reason: 'only the mount fns are e2e-only' } },
      FLOOR,
    );
    expect(r.belowFloor.map((b) => b.metric).sort()).toEqual(['branches', 'lines', 'statements']);
  });

  it('fails a stale exception once the file clears an excused metric, so the list can only shrink', () => {
    const r = checkFloor(
      { 'a/src/x.ts': FULL },
      { 'src/x.ts': { metrics: ['lines'], reason: 'e2e-only' } },
      FLOOR,
    );
    expect(r.staleExceptions).toEqual([{ file: 'src/x.ts', metric: 'lines' }]);
  });

  it('fails an exception for a file the report no longer holds', () => {
    const r = checkFloor(
      { 'a/src/y.ts': FULL },
      { 'src/gone.ts': { metrics: ['lines'], reason: 'deleted' } },
      FLOOR,
    );
    expect(r.staleExceptions).toEqual([{ file: 'src/gone.ts', metric: 'lines' }]);
  });

  it('ignores the total row', () => {
    const r = checkFloor({ total: BARE, 'a/src/x.ts': FULL }, {}, FLOOR);
    expect(r.checked).toBe(1);
    expect(r.belowFloor).toEqual([]);
  });

  it('keeps every shipped exception documented with a reason and at least one metric', () => {
    for (const [file, ex] of Object.entries(EXCEPTIONS)) {
      expect(file.startsWith('src/'), file).toBe(true);
      expect(ex.reason.length, file).toBeGreaterThan(10);
      expect(ex.metrics.length, file).toBeGreaterThan(0);
      for (const m of ex.metrics) expect(Object.keys(FLOOR), file).toContain(m);
    }
  });
});

describe('missingSpecs', () => {
  it('reports an exception whose named e2e spec no longer exists, and only those', () => {
    const exceptions = {
      'src/a.ts': { metrics: ['lines'] as const, reason: 'e2e', spec: 'tests/e2e/a.spec.ts' },
      'src/b.ts': { metrics: ['lines'] as const, reason: 'e2e', spec: 'tests/e2e/gone.spec.ts' },
      'src/c.ts': { metrics: ['lines'] as const, reason: 'unit-only' },
    };
    const exists = (rel: string): boolean => rel === 'tests/e2e/a.spec.ts';
    expect(missingSpecs(exceptions, exists)).toEqual([
      { file: 'src/b.ts', spec: 'tests/e2e/gone.spec.ts' },
    ]);
  });

  it('every shipped exception that names a spec points at a file in the tree', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    expect(missingSpecs(EXCEPTIONS, (rel) => fs.existsSync(path.join(root, rel)))).toEqual([]);
  });
});

// The v8 summary reports pct 0 for 1/1 and for a file with nothing executable.
describe('percent', () => {
  it('computes from covered/total instead of the reported pct', () => {
    expect(percent({ pct: 0, covered: 1, total: 1 })).toBe(100);
    expect(percent({ pct: 0, covered: 3, total: 10 })).toBe(30);
  });

  it('treats an empty metric as nothing to cover', () => {
    expect(percent({ pct: 0, covered: 0, total: 0 })).toBe(100);
  });

  it('falls back to pct when the counts are absent', () => {
    expect(percent({ pct: 42 })).toBe(42);
  });
});
