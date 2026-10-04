import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EGA_ATTR_RE = /data-ega-[a-z0-9-]+/g;
const TESTID_RE = /data-testid="([^"]+)"/g;

export interface AffordanceAuditResult {
  srcMarkers: string[];
  specMarkers: string[];
  uncovered: string[];
  newDrift: string[];
  staleBaseline: string[];
}

function walkFiles(dir: string, ext: readonly string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  function walk(d: string): void {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && ext.some((e) => entry.name.endsWith(e))) {
        out.push(full);
      }
    }
  }
  walk(dir);
  return out;
}

function extractMarkersFromText(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(EGA_ATTR_RE)) {
    out.add(m[0]);
  }
  for (const m of text.matchAll(TESTID_RE)) {
    if (m[1] !== undefined) out.add(`data-testid="${m[1]}"`);
  }
  return out;
}

function collectMarkersFromFiles(files: string[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    for (const m of extractMarkersFromText(fs.readFileSync(f, 'utf8'))) {
      out.add(m);
    }
  }
  return out;
}

export function computeDrift(
  srcMarkers: ReadonlySet<string>,
  specMarkers: ReadonlySet<string>,
  baseline: readonly string[],
): { uncovered: string[]; newDrift: string[]; staleBaseline: string[] } {
  const baselineSet = new Set(baseline);
  const uncovered = [...srcMarkers].filter((m) => !specMarkers.has(m)).sort();
  const newDrift = uncovered.filter((m) => !baselineSet.has(m));
  const staleBaseline = baseline.filter((m) => !uncovered.includes(m)).sort();
  return { uncovered, newDrift, staleBaseline };
}

/** Fails on new drift and on a baselined marker that is now covered or gone, so the baseline only shrinks. */
export function auditExitCode(result: Pick<AffordanceAuditResult, 'newDrift' | 'staleBaseline'>) {
  return result.newDrift.length > 0 || result.staleBaseline.length > 0 ? 1 : 0;
}

/** `prune` only drops entries that stopped drifting, so it can never turn a red gate green; `accept` is the deliberate-debt path. */
export function nextBaseline(
  mode: 'prune' | 'accept',
  uncovered: readonly string[],
  baseline: readonly string[],
): string[] {
  if (mode === 'accept') return [...uncovered].sort();
  const stillUncovered = new Set(uncovered);
  return baseline.filter((m) => stillUncovered.has(m)).sort();
}

function readBaseline(baselinePath: string): string[] {
  if (!fs.existsSync(baselinePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as string[];
  } catch {
    return [];
  }
}

export async function runAffordanceAudit(repoRoot: string): Promise<AffordanceAuditResult> {
  const srcFiles = walkFiles(path.join(repoRoot, 'src'), ['.svelte', '.ts']);
  const specFiles = walkFiles(path.join(repoRoot, 'tests/e2e'), ['.ts']);

  const srcMarkerSet = collectMarkersFromFiles(srcFiles);
  const specMarkerSet = collectMarkersFromFiles(specFiles);

  const baselinePath = path.join(repoRoot, 'scripts/affordance-baseline.json');
  const baseline = readBaseline(baselinePath);

  const { uncovered, newDrift, staleBaseline } = computeDrift(
    srcMarkerSet,
    specMarkerSet,
    baseline,
  );

  return {
    srcMarkers: [...srcMarkerSet].sort(),
    specMarkers: [...specMarkerSet].sort(),
    uncovered,
    newDrift,
    staleBaseline,
  };
}

const isCli =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]);

if (isCli) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const baselinePath = path.join(repoRoot, 'scripts/affordance-baseline.json');
  const isJson = process.argv.includes('--json');
  const prune = process.argv.includes('--update-baseline');
  const accept = process.argv.includes('--accept-drift');

  runAffordanceAudit(repoRoot)
    .then((result) => {
      if (prune || accept) {
        const before = readBaseline(baselinePath);
        const next = nextBaseline(accept ? 'accept' : 'prune', result.uncovered, before);
        fs.writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
        process.stdout.write(
          `affordance-audit: baseline ${before.length} → ${next.length} entries (${accept ? 'accept' : 'prune'})\n`,
        );
        // Pruning never accepts drift, so an unbaselined marker still fails.
        const left = result.newDrift.filter((m) => !next.includes(m));
        for (const m of left) process.stdout.write(`    + ${m} — still uncovered\n`);
        process.exit(left.length > 0 ? 1 : 0);
      }

      const { uncovered, newDrift, staleBaseline } = result;

      if (isJson) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        process.stdout.write(
          `affordance-audit: ${uncovered.length} uncovered, ${newDrift.length} new since baseline\n`,
        );
        if (staleBaseline.length > 0) {
          process.stdout.write(
            `  stale baseline entries (now covered/removed): ${staleBaseline.length}\n`,
          );
          for (const m of staleBaseline) process.stdout.write(`    - ${m}\n`);
          process.stdout.write(
            `  → the baseline must shrink: run \`pnpm audit:affordances --update-baseline\`\n`,
          );
        }
        if (newDrift.length > 0) {
          process.stdout.write(`  NEW uncovered affordances — write a flow spec for each:\n`);
          for (const m of newDrift) process.stdout.write(`    + ${m}\n`);
          process.stdout.write(
            `  → shipping them uncovered is a deliberate call: \`pnpm audit:affordances --accept-drift\`\n`,
          );
        }
      }

      process.exit(auditExitCode(result));
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `affordance-audit failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(2);
    });
}
