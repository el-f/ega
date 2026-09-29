#!/usr/bin/env tsx
// Promotes the shots in audit/current to audit/baseline and carries their report.json verdicts into baseline-verdict.json, which the next judge run inherits.
import { copyFile, mkdir, readdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AUDIT_DIR = path.join(ROOT, 'tests', 'screenshots', 'audit');
const CURRENT_DIR = path.join(AUDIT_DIR, 'current');
const BASELINE_DIR = path.join(AUDIT_DIR, 'baseline');
const REPORT_JSON = path.join(AUDIT_DIR, 'report.json');
const BASELINE_VERDICT = path.join(AUDIT_DIR, 'baseline-verdict.json');

interface FileVerdict {
  file: string;
  surface: string;
  state: string;
  overall: string;
  issues: { description: string; severity: 'minor' | 'major'; axis?: string }[];
}

interface BatchReport {
  files: FileVerdict[];
}

async function listShots(dir: string): Promise<string[]> {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return [];
  } catch {
    return [];
  }
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith('.png'));
}

async function main(): Promise<void> {
  const flagIdx = process.argv.indexOf('--shot');
  const onlyShot = flagIdx >= 0 ? process.argv[flagIdx + 1] : null;

  if (!existsSync(CURRENT_DIR)) {
    console.error('No current/ dir — run `pnpm visual:capture` first.');
    process.exit(2);
  }
  await mkdir(BASELINE_DIR, { recursive: true });

  const shots = await listShots(CURRENT_DIR);
  if (!shots.length) {
    console.error('No PNGs in current/.');
    process.exit(2);
  }

  const target = onlyShot ? shots.filter((f) => f === onlyShot || f === `${onlyShot}.png`) : shots;
  if (!target.length) {
    console.error(`No matching shots for --shot=${onlyShot ?? '<all>'}`);
    process.exit(2);
  }

  let promoted = 0;
  for (const f of target) {
    await copyFile(path.join(CURRENT_DIR, f), path.join(BASELINE_DIR, f));
    promoted += 1;
  }

  // Only a full promotion can tell a retired shot from one this run skipped.
  if (!onlyShot) {
    const baselineShots = await listShots(BASELINE_DIR);
    const currentSet = new Set(shots);
    for (const stale of baselineShots) {
      if (!currentSet.has(stale)) {
        await rm(path.join(BASELINE_DIR, stale), { force: true });
      }
    }
  }

  // Persist the verdict map so the next judge run can inherit.
  let verdictMap: Record<
    string,
    Pick<FileVerdict, 'overall' | 'issues' | 'surface' | 'state'>
  > = {};
  if (existsSync(REPORT_JSON)) {
    try {
      const report = JSON.parse(await readFile(REPORT_JSON, 'utf8')) as BatchReport;
      for (const f of report.files ?? []) {
        if (onlyShot && f.file !== onlyShot && f.file !== `${onlyShot}.png`) continue;
        verdictMap[f.file] = {
          overall: f.overall,
          issues: f.issues,
          surface: f.surface,
          state: f.state,
        };
      }
    } catch {
      console.warn('Could not parse report.json — baseline-verdict.json will be empty.');
    }
  }

  // If we only promoted one shot, merge with the existing verdict map.
  if (onlyShot && existsSync(BASELINE_VERDICT)) {
    try {
      const prior = JSON.parse(await readFile(BASELINE_VERDICT, 'utf8')) as typeof verdictMap;
      verdictMap = { ...prior, ...verdictMap };
    } catch {
      /* prior corrupt; overwrite */
    }
  }

  await writeFile(BASELINE_VERDICT, JSON.stringify(verdictMap, null, 2));
  console.log(
    `Promoted ${promoted} shot(s) to baseline/ + persisted ${Object.keys(verdictMap).length} verdict(s).`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
