/** Per-file coverage floor (vitest does aggregate or per-file, not both); run after pnpm test:cov. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FLOOR = { lines: 70, statements: 70, functions: 50, branches: 50 } as const;

export type Metric = keyof typeof FLOOR;

/** Each entry names the metrics it excuses; every other metric is still enforced. */
export interface Exception {
  metrics: readonly Metric[];
  reason: string;
  /** The e2e spec that covers what the unit floor cannot. An excuse that names a runner is a claim the check can verify. */
  spec?: string;
}

/** Files below the floor, with the reason; a file that climbs above an excused metric must drop it. */
export const EXCEPTIONS: Readonly<Record<string, Exception>> = {
  // Re-frozen when vitest 4's AST-based v8 remapping replaced line-based counts; each row drops off once a test covers the file.
  'src/content/testHooks.ts': {
    metrics: ['lines', 'statements', 'functions', 'branches'],
    reason: 'E2E-only hook surface; dead-code-eliminated unless EGA_E2E_HOOKS=1',
  },
  'src/options/components/ModelCombobox.svelte': {
    metrics: ['lines', 'statements', 'functions', 'branches'],
    reason: 'no direct unit test for these paths',
  },
  'src/options/components/TemplateDiffModal.svelte': {
    metrics: ['lines', 'statements', 'functions', 'branches'],
    reason: 'options component with no unit test yet',
  },
  'src/shared/ui/Icon.svelte': {
    metrics: ['branches'],
    reason: 'no direct unit test for these paths',
  },
};

/** Exceptions whose named spec is gone — the excuse no longer points at anything that runs. */
export function missingSpecs(
  exceptions: Readonly<Record<string, Exception>>,
  exists: (rel: string) => boolean,
): { file: string; spec: string }[] {
  const out: { file: string; spec: string }[] = [];
  for (const [file, ex] of Object.entries(exceptions)) {
    if (ex.spec !== undefined && !exists(ex.spec)) out.push({ file, spec: ex.spec });
  }
  return out;
}

interface MetricSummary {
  pct: number;
  covered?: number;
  total?: number;
}

export interface FileSummary {
  lines: MetricSummary;
  statements: MetricSummary;
  functions: MetricSummary;
  branches: MetricSummary;
}

/** From covered/total when present: the v8 summary reports pct 0 for 1/1 and for a file with nothing executable. An empty metric has nothing to cover. */
export function percent(m: MetricSummary): number {
  if (typeof m.covered !== 'number' || typeof m.total !== 'number') return m.pct;
  return m.total === 0 ? 100 : Math.round((m.covered / m.total) * 10_000) / 100;
}

export interface FloorResult {
  belowFloor: { file: string; metric: string; pct: number }[];
  staleExceptions: { file: string; metric: Metric }[];
  checked: number;
}

function countSvelteLines(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += countSvelteLines(p);
    else if (entry.name.endsWith('.svelte')) total += fs.readFileSync(p, 'utf8').split('\n').length;
  }
  return total;
}

/** Coverage keys are absolute and platform-shaped; the floor list is repo-relative. */
export function toRepoPath(key: string): string {
  const norm = key.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/src/');
  return i === -1 ? norm : norm.slice(i + 1);
}

export function checkFloor(
  summary: Record<string, FileSummary>,
  exceptions: Readonly<Record<string, Exception>> = EXCEPTIONS,
  floor: Readonly<Record<string, number>> = FLOOR,
): FloorResult {
  const byFile = new Map<string, FileSummary>();
  for (const [key, value] of Object.entries(summary)) {
    if (key !== 'total') byFile.set(toRepoPath(key), value);
  }

  const clears = (v: FileSummary, metric: string): boolean =>
    percent(v[metric as keyof FileSummary]) >= (floor[metric] ?? 0);

  const belowFloor: FloorResult['belowFloor'] = [];
  for (const [file, v] of byFile) {
    const excused: readonly string[] = exceptions[file]?.metrics ?? [];
    for (const metric of Object.keys(floor)) {
      if (excused.includes(metric) || clears(v, metric)) continue;
      belowFloor.push({ file, metric, pct: percent(v[metric as keyof FileSummary]) });
    }
  }

  const staleExceptions: FloorResult['staleExceptions'] = [];
  for (const [file, ex] of Object.entries(exceptions)) {
    const v = byFile.get(file);
    for (const metric of ex.metrics) {
      // Absent from the report means deleted or excluded — either way the exception is dead.
      if (v === undefined || clears(v, metric)) staleExceptions.push({ file, metric });
    }
  }
  staleExceptions.sort((a, b) => a.file.localeCompare(b.file) || a.metric.localeCompare(b.metric));

  return { belowFloor, staleExceptions, checked: byFile.size };
}

const isCli =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]);

if (isCli) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const summaryPath = path.join(repoRoot, 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    process.stderr.write(
      `coverage-floor: ${summaryPath} is missing — run \`pnpm test:cov\` first\n`,
    );
    process.exit(2);
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as Record<string, FileSummary>;
  const { belowFloor, staleExceptions, checked } = checkFloor(summary);

  process.stdout.write(
    `coverage-floor: ${checked} files against ${JSON.stringify(FLOOR)}, ${Object.keys(EXCEPTIONS).length} exceptions\n`,
  );
  // Say what the percentage covers, so it is never read as a whole-codebase number by mistake.
  const svelteMeasured = Object.keys(summary).some((k) => k.endsWith('.svelte'));
  const svelteLines = countSvelteLines(path.join(repoRoot, 'src'));
  process.stdout.write(
    svelteMeasured
      ? `coverage-floor: .svelte components are included (${svelteLines} lines)\n`
      : `coverage-floor: ${svelteLines} lines of .svelte components are outside this measurement\n`,
  );
  for (const b of belowFloor) {
    process.stdout.write(
      `  ✗ ${b.file} — ${b.metric} ${b.pct}% < ${FLOOR[b.metric as 'lines']}%\n`,
    );
  }
  for (const s of staleExceptions) {
    process.stdout.write(
      `  ✗ stale exception: ${s.file} now clears ${s.metric} — drop that metric\n`,
    );
  }
  const missing = missingSpecs(EXCEPTIONS, (rel) => fs.existsSync(path.join(repoRoot, rel)));
  for (const m of missing) {
    process.stdout.write(`  ✗ ${m.file} is excused by ${m.spec}, which does not exist\n`);
  }
  process.exit(belowFloor.length > 0 || staleExceptions.length > 0 || missing.length > 0 ? 1 : 0);
}
