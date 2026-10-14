/** Grades only the journeys whose specs changed. Blocker findings still exit 0 unless `--strict` or `EGA_UX_JUDGE_STRICT=1` is set. */
import { execSync } from 'node:child_process';
import pLimit from 'p-limit';
import { CONFIG } from '../config';
import { loadJourneys } from '../loader/journeys';
import { changedFlowFiles, coverageIdsFromFlowFile } from '../loader/changed-flows';
import { composeRubric } from '../loader/rubric';
import { composeJudgePrompt } from '../judge/prompt';
import { callJudge } from '../judge/call';
import { writeRunJson, type RunRow } from '../report/json';
import { writeRunMarkdown } from '../report/md';

function shortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export async function diff(args: ReadonlyArray<string>): Promise<void> {
  const strict = args.includes('--strict') || process.env['EGA_UX_JUDGE_STRICT'] === '1';
  if (args.includes('--warn-only') && strict) {
    console.warn('ux-judge diff: --warn-only ignored because --strict is also set.');
  }
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
  const changed = changedFlowFiles(base);
  if (changed.length === 0) {
    console.log('No flow specs changed. Nothing to grade.');
    return;
  }
  const ids = new Set<string>();
  for (const f of changed) for (const id of coverageIdsFromFlowFile(f)) ids.add(id);
  const journeys = (await loadJourneys()).filter((j) => ids.has(j.coverage));
  if (journeys.length === 0) {
    console.log(`No journey sidecars for ${ids.size} changed flow(s). Skipping.`);
    return;
  }
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.log(
      `ux-judge diff: ANTHROPIC_API_KEY not set — skipping ${journeys.length} journey(s).`,
    );
    return;
  }
  const limit = pLimit(CONFIG.concurrency.diff);
  const rows: RunRow[] = [];
  await Promise.all(
    journeys.map((j) =>
      limit(async () => {
        const rubric = await composeRubric(j.coverage);
        const prompt = composeJudgePrompt(rubric, j);
        const verdict = await callJudge(prompt, 'diff');
        rows.push({
          coverage: j.coverage,
          verdict,
          judgeModel: CONFIG.judgeModel.diff,
          at: new Date().toISOString(),
        });
      }),
    ),
  );
  const runId = `diff-${shortSha()}`;
  await writeRunJson(rows, runId);
  const mdFile = await writeRunMarkdown(rows, runId);
  const hasBlocker = rows.some((r) => r.verdict.severity === 'blocker');
  if (hasBlocker) {
    console.error(`UX judge diff: blocker findings. See ${mdFile}`);
    if (strict) process.exit(1);
  } else {
    console.log(`UX judge diff: clean. ${rows.length} journeys graded.`);
  }
}
