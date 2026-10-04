import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildPaths, UNCHANGED_THRESHOLD_PCT, type JudgePaths } from '../config';
import { listCurrentShots, currentPathFor } from '../loader/capture';
import { loadMeta } from '../loader/meta';
import { loadRubric } from '../loader/rubric';
import { loadBaselineVerdicts } from '../loader/baseline';
import { diffPct } from '../diff/pixel';
import { composeShotPrompt } from '../judge/prompts';
import { runShotWithRolls } from '../judge/ensemble';
import { buildBatchReport, writeReportJson } from '../report/json';
import { writeReportMd } from '../report/md';
import type { FileVerdict } from '../judge/types';

export interface CheckOptions {
  strict?: boolean;
  noSkip?: boolean;
  /** Roll the LLM N times per shot, majority-vote the verdict. Default 1. */
  rolls?: number;
  paths?: JudgePaths;
}

export async function runCheck(opts: CheckOptions = {}): Promise<{ exitCode: number }> {
  const paths = opts.paths ?? buildPaths();
  const strict = !!opts.strict;
  const noSkip = !!opts.noSkip;
  const rolls = Math.max(1, Math.floor(opts.rolls ?? 1));

  await mkdir(paths.auditDir, { recursive: true });
  const shots = await listCurrentShots(paths);
  if (!shots.length) {
    console.error('No PNGs in current/ — run `pnpm visual:capture` first.');
    return { exitCode: 2 };
  }

  const baselineExists = existsSync(paths.baselineDir);
  const baselineVerdicts = baselineExists ? await loadBaselineVerdicts(paths.baselineVerdict) : {};

  console.log(
    `Judging ${shots.length} screenshots…${baselineExists ? '' : ' (no baseline — full LLM on every shot)'}`,
  );

  const files: FileVerdict[] = [];
  for (const f of shots) {
    process.stdout.write(`  ${f} …`);
    const name = f.replace(/\.png$/, '');
    const meta = await loadMeta(paths.metaDir, name);
    const currentPath = currentPathFor(paths, f);
    const baselinePath = path.join(paths.baselineDir, f);
    let pctDiff: number | null = null;

    if (baselineExists && !noSkip && existsSync(baselinePath)) {
      pctDiff = await diffPct(currentPath, baselinePath);
      if (pctDiff !== null && pctDiff < UNCHANGED_THRESHOLD_PCT) {
        const prior = baselineVerdicts[f];
        if (prior && prior.overall !== 'major-issues') {
          const inheritedVerdict: FileVerdict = {
            file: f,
            surface: meta.surface,
            state: meta.state,
            diff_pct: pctDiff,
            inherited_from_baseline: true,
            overall: prior.overall,
            issues: prior.issues,
          };
          if (meta.theme) inheritedVerdict.theme = meta.theme;
          process.stdout.write(
            ` unchanged (${pctDiff.toFixed(2)}% diff, inherited ${prior.overall})\n`,
          );
          files.push(inheritedVerdict);
          continue;
        }
      }
    } else if (baselineExists && !noSkip && !existsSync(baselinePath)) {
      pctDiff = null;
      process.stdout.write(' new …');
    }

    const rubric = await loadRubric(paths.rubricDir, meta.surface);
    const prompt = composeShotPrompt(rubric, meta);
    const ensemble = await runShotWithRolls(currentPath, prompt, rolls);
    const v = ensemble.verdict;
    const rollHint = rolls > 1 ? ` [×${rolls}]` : '';
    process.stdout.write(
      ` ${v.overall}${rollHint}${pctDiff !== null ? ` (${pctDiff.toFixed(2)}% diff)` : ''}\n`,
    );
    const verdict: FileVerdict = {
      file: f,
      surface: meta.surface,
      state: meta.state,
      inherited_from_baseline: false,
      issues: v.issues,
      overall: v.overall,
    };
    if (meta.theme) verdict.theme = meta.theme;
    if (pctDiff !== null) verdict.diff_pct = pctDiff;
    if (v.density) verdict.density = v.density;
    if (v.contrast) verdict.contrast = v.contrast;
    if (v.hierarchy) verdict.hierarchy = v.hierarchy;
    if (v.copy) verdict.copy = v.copy;
    if (v.empty_state) verdict.empty_state = v.empty_state;
    if (v.primitive_coherence) verdict.primitive_coherence = v.primitive_coherence;
    if (v.theme_parity) verdict.theme_parity = v.theme_parity;
    if (v.scrim) verdict.scrim = v.scrim;
    if (v.overflow) verdict.overflow = v.overflow;
    if (v.raw) verdict.raw = v.raw;
    files.push(verdict);
  }

  const report = buildBatchReport(files);
  await writeReportJson(paths.reportJson, report);
  await writeReportMd(paths.reportMd, report);
  console.log(`\nWrote ${paths.reportJson} and ${paths.reportMd}`);
  console.log(
    `Summary: ${report.ok} ok · ${report.minor} minor · ${report.major} major · ${report.inconclusive} inconclusive · ${report.unchanged} unchanged · ${report.cli_errors} errors`,
  );
  if (strict && report.major > 0) {
    console.error(`Strict mode: ${report.major} major finding(s) — failing.`);
    return { exitCode: 1 };
  }
  return { exitCode: 0 };
}
