/** Ranks survivors in reports/mutation/mutation.json; optional-spread and guard-then-assign mutants only assign an undefined that omitUndef/JSON.stringify erase, so they and log-only ones are flagged unkillable. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface Mutant {
  mutatorName: string;
  status: string;
  location: { start: { line: number } };
}

export interface MutationReport {
  files: Record<string, { source: string; mutants: Mutant[] }>;
}

export type Bucket = 'optional-spread' | 'guard-assign' | 'log-only' | 'open';

const OPTIONAL_SPREAD = /^\.\.\.\(.*\?\s*\{.*\}\s*:\s*\{\}\)/;
const GUARD_ASSIGN = /^if \(\w[\w.]*(?:\?\.\w+)* !== undefined\) \w[\w.]*\s*=/;
const LOG_ONLY = /debugCatch|logger\.|console\.|setLiveMessage|announce\(/;

export function bucketFor(sourceLine: string): Bucket {
  const line = sourceLine.trim();
  if (OPTIONAL_SPREAD.test(line)) return 'optional-spread';
  if (GUARD_ASSIGN.test(line)) return 'guard-assign';
  if (LOG_ONLY.test(line)) return 'log-only';
  return 'open';
}

export interface Survivor {
  file: string;
  line: number;
  mutator: string;
  source: string;
  bucket: Bucket;
  noCoverage: boolean;
}

export function survivorsOf(report: MutationReport): Survivor[] {
  const out: Survivor[] = [];
  for (const [file, entry] of Object.entries(report.files)) {
    const src = entry.source.split('\n');
    for (const m of entry.mutants) {
      if (m.status !== 'Survived' && m.status !== 'NoCoverage') continue;
      const source = (src[m.location.start.line - 1] ?? '').trim();
      out.push({
        file,
        line: m.location.start.line,
        mutator: m.mutatorName,
        source,
        bucket: bucketFor(source),
        noCoverage: m.status === 'NoCoverage',
      });
    }
  }
  return out;
}

export function rankByFile(survivors: readonly Survivor[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const s of survivors) counts.set(s.file, (counts.get(s.file) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

const DETECTED = new Set(['Killed', 'Timeout']);
const UNDETECTED = new Set(['Survived', 'NoCoverage']);

/** Stryker's per-file score (detected over detected + undetected), rounded to 2 places, for every file below `floor`. */
export function filesUnderFloor(report: MutationReport, floor: number): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const [file, entry] of Object.entries(report.files)) {
    const detected = entry.mutants.filter((m) => DETECTED.has(m.status)).length;
    const valid = detected + entry.mutants.filter((m) => UNDETECTED.has(m.status)).length;
    if (valid === 0) continue;
    const score = Math.round((detected / valid) * 10000) / 100;
    if (score < floor) out.push([file, score]);
  }
  return out.sort((a, b) => a[1] - b[1]);
}

const isCli =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]);

if (isCli) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reportPath = path.join(repoRoot, 'reports', 'mutation', 'mutation.json');
  if (!fs.existsSync(reportPath)) {
    process.stderr.write(`mutation-survivors: ${reportPath} is missing — run \`pnpm mutate\`\n`);
    process.exit(2);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as MutationReport;
  const survivors = survivorsOf(report);
  const open = survivors.filter((s) => s.bucket === 'open');

  process.stdout.write(`mutation-survivors: ${survivors.length} total, ${open.length} open\n`);
  for (const bucket of ['optional-spread', 'guard-assign', 'log-only'] as const) {
    const n = survivors.filter((s) => s.bucket === bucket).length;
    if (n > 0) process.stdout.write(`  ${String(n).padStart(4)} ${bucket} (unkillable)\n`);
  }

  process.stdout.write('\nopen, by file:\n');
  for (const [file, n] of rankByFile(open)) {
    process.stdout.write(`  ${String(n).padStart(4)} ${file}\n`);
  }

  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith('--'));
  if (only !== undefined) {
    process.stdout.write(`\nopen in ${only}:\n`);
    for (const s of open.filter((x) => x.file.includes(only)).sort((a, b) => a.line - b.line)) {
      const tag = s.noCoverage ? ' NO-COV' : '';
      process.stdout.write(`  L${String(s.line).padStart(4)} [${s.mutator}]${tag} ${s.source}\n`);
    }
  } else {
    process.stdout.write('\nPass a path fragment to list a file’s open survivors.\n');
  }

  const floorArg = args.find((a) => a.startsWith('--floor='));
  if (floorArg !== undefined) {
    const floor = Number(floorArg.slice('--floor='.length));
    if (!Number.isFinite(floor)) {
      process.stderr.write(`mutation-survivors: ${floorArg} is not a number\n`);
      process.exit(2);
    }
    const under = filesUnderFloor(report, floor);
    if (under.length > 0) {
      process.stderr.write(
        `\n${under.length} file(s) score under the per-file floor of ${floor}:\n`,
      );
      for (const [file, score] of under) process.stderr.write(`  ${score.toFixed(2)} ${file}\n`);
      process.exit(1);
    }
    process.stdout.write(`\nEvery mutated file scores ${floor} or more.\n`);
  }
}
