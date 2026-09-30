import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface LintResult {
  ok: boolean;
  errors: string[];
  stats: { actions: number; flows: number; covered: number };
}

const MARKER_RE = /\/\*\s*coverage:\s*([a-z0-9-]+)\.([a-z0-9-]+)\.([a-z0-9-]+)\s*\*\//g;

interface CoverageFamily {
  id: string;
  surfaces: {
    id: string;
    actions: { id: string; description: string; flows: readonly string[] }[];
  }[];
}

// tsx's own import skips the host bundler, which would fail to resolve a coverage.ts outside the project root.
async function loadCoverage(repoRoot: string): Promise<readonly CoverageFamily[]> {
  const covPath = path.join(repoRoot, 'tests/e2e/flows/coverage.ts');
  if (!fs.existsSync(covPath)) return [];
  const { tsImport } = (await import('tsx/esm/api')) as {
    tsImport: (
      specifier: string,
      parentURL: string,
    ) => Promise<{
      COVERAGE?: readonly CoverageFamily[];
      default?: { COVERAGE?: readonly CoverageFamily[] };
    }>;
  };
  const mod = await tsImport(pathToFileURL(covPath).href, import.meta.url);
  // A namespace-isolating ESM host (vitest) hands back a `default` wrapper; a direct CLI run hands back bare exports.
  return mod.COVERAGE ?? mod.default?.COVERAGE ?? [];
}

function listFlowFiles(repoRoot: string): string[] {
  const root = path.join(repoRoot, 'tests/e2e/flows');
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // Underscore-prefixed entries hold harness scaffolding, not coverage targets.
      if (entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.flow.spec.ts')) {
        out.push(path.relative(root, full).replaceAll('\\', '/'));
      }
    }
  }
  walk(root);
  return out;
}

function extractMarkers(filePath: string): { family: string; surface: string; action: string }[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const out: { family: string; surface: string; action: string }[] = [];
  for (const m of content.matchAll(MARKER_RE)) {
    const [, family, surface, action] = m;
    if (family && surface && action) out.push({ family, surface, action });
  }
  return out;
}

export async function lintCoverage(repoRoot: string): Promise<LintResult> {
  const errors: string[] = [];
  const coverage = await loadCoverage(repoRoot);
  const flowFiles = listFlowFiles(repoRoot);
  let actions = 0;
  let covered = 0;
  const referencedFlows = new Set<string>();
  const expectedMarkers = new Map<string, Set<string>>();

  for (const fam of coverage) {
    for (const surf of fam.surfaces) {
      for (const act of surf.actions) {
        actions += 1;
        if (act.flows.length === 0) {
          errors.push(`${fam.id}.${surf.id}.${act.id}: no flows`);
          continue;
        }
        covered += 1;
        for (const flow of act.flows) {
          referencedFlows.add(flow);
          const full = path.join(repoRoot, 'tests/e2e/flows', flow);
          if (!fs.existsSync(full)) {
            errors.push(`${fam.id}.${surf.id}.${act.id}: ${flow} does not exist`);
            continue;
          }
          const key = `${fam.id}.${surf.id}.${act.id}`;
          let bucket = expectedMarkers.get(flow);
          if (!bucket) {
            bucket = new Set();
            expectedMarkers.set(flow, bucket);
          }
          bucket.add(key);
        }
      }
    }
  }

  for (const flow of flowFiles) {
    if (!referencedFlows.has(flow)) {
      errors.push(`${flow}: not referenced in coverage.ts`);
      continue;
    }
    const full = path.join(repoRoot, 'tests/e2e/flows', flow);
    const markers = extractMarkers(full).map((m) => `${m.family}.${m.surface}.${m.action}`);
    if (markers.length === 0) {
      errors.push(`${flow}: missing coverage marker comment`);
      continue;
    }
    const expected = expectedMarkers.get(flow) ?? new Set<string>();
    for (const want of expected) {
      if (!markers.includes(want)) {
        errors.push(`${flow}: missing marker for ${want}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: { actions, flows: flowFiles.length, covered },
  };
}

const isCli =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]);
if (isCli) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  lintCoverage(repoRoot)
    .then((res) => {
      if (process.argv.includes('--json')) {
        process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      } else {
        const { actions, flows, covered } = res.stats;
        process.stdout.write(
          `flow-coverage: ${covered}/${actions} actions have a flow spec (marker check, not a test run), ${flows} flow files\n`,
        );
        for (const e of res.errors) process.stdout.write(`  - ${e}\n`);
      }
      process.exit(res.ok ? 0 : 1);
    })
    .catch((err: unknown) => {
      process.stderr.write(`flow-coverage failed: ${err instanceof Error ? err.message : err}\n`);
      process.exit(2);
    });
}
