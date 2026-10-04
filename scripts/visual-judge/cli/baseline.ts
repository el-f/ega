// Promotes the shots in audit/current to audit/baseline and carries their report.json verdicts into baseline-verdict.json, which the next judge run inherits.
import { copyFile, mkdir, readdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildPaths, type JudgePaths } from '../config';
import type { BaselineVerdictMap, BatchReport } from '../judge/types';

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

export async function runBaseline(
  onlyShot?: string,
  paths: JudgePaths = buildPaths(),
): Promise<{ exitCode: number }> {
  if (!existsSync(paths.currentDir)) {
    console.error('No current/ dir — run `pnpm visual:capture` first.');
    return { exitCode: 2 };
  }
  await mkdir(paths.baselineDir, { recursive: true });

  const shots = await listShots(paths.currentDir);
  if (!shots.length) {
    console.error('No PNGs in current/.');
    return { exitCode: 2 };
  }

  const target = onlyShot ? shots.filter((f) => f === onlyShot || f === `${onlyShot}.png`) : shots;
  if (!target.length) {
    console.error(`No matching shots for --shot=${onlyShot ?? '<all>'}`);
    return { exitCode: 2 };
  }

  let promoted = 0;
  for (const f of target) {
    await copyFile(path.join(paths.currentDir, f), path.join(paths.baselineDir, f));
    promoted += 1;
  }

  // Only a full promotion can tell a retired shot from one this run skipped.
  if (!onlyShot) {
    const baselineShots = await listShots(paths.baselineDir);
    const currentSet = new Set(shots);
    for (const stale of baselineShots) {
      if (!currentSet.has(stale)) {
        await rm(path.join(paths.baselineDir, stale), { force: true });
      }
    }
  }

  // Persist the verdict map so the next judge run can inherit.
  let verdictMap: BaselineVerdictMap = {};
  if (existsSync(paths.reportJson)) {
    try {
      const report = JSON.parse(await readFile(paths.reportJson, 'utf8')) as BatchReport;
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
  if (onlyShot && existsSync(paths.baselineVerdict)) {
    try {
      const prior = JSON.parse(await readFile(paths.baselineVerdict, 'utf8')) as BaselineVerdictMap;
      verdictMap = { ...prior, ...verdictMap };
    } catch {
      /* prior corrupt; overwrite */
    }
  }

  await writeFile(paths.baselineVerdict, JSON.stringify(verdictMap, null, 2));
  console.log(
    `Promoted ${promoted} shot(s) to baseline/ + persisted ${Object.keys(verdictMap).length} verdict(s).`,
  );
  return { exitCode: 0 };
}
