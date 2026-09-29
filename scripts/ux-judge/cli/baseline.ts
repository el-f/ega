/** baseline: grades every journey with a 3-roll vote, writes the report and promotes the new baseline. */
import pLimit from 'p-limit';
import { CONFIG } from '../config';
import { loadJourneys } from '../loader/journeys';
import { composeRubric } from '../loader/rubric';
import { composeJudgePrompt } from '../judge/prompt';
import { callJudge } from '../judge/call';
import { ensemble } from '../judge/ensemble';
import { writeRunJson, type RunRow } from '../report/json';
import { writeRunMarkdown } from '../report/md';
import { promoteBaseline } from '../report/baseline';
import type { JudgeVerdict } from '../judge/parse';

export async function baseline(_args: ReadonlyArray<string>): Promise<void> {
  const journeys = await loadJourneys();
  if (journeys.length === 0) {
    console.log('No journeys to grade. Run flow tests with EGA_UX_RECORD=1 first.');
    return;
  }
  const limit = pLimit(CONFIG.concurrency.baseline);
  const rows: RunRow[] = [];
  await Promise.all(
    journeys.map((j) =>
      limit(async () => {
        const rubric = await composeRubric(j.coverage);
        const prompt = composeJudgePrompt(rubric, j);
        const verdicts: JudgeVerdict[] = await Promise.all(
          Array.from({ length: CONFIG.rolls.baseline }, () => callJudge(prompt, 'baseline')),
        );
        const severity = ensemble(verdicts.map((v) => v.severity));
        const winner = verdicts.find((v) => v.severity === severity) ?? verdicts[0];
        if (!winner) return;
        rows.push({
          coverage: j.coverage,
          verdict: { ...winner, severity },
          judgeModel: CONFIG.judgeModel.baseline,
          at: new Date().toISOString(),
        });
      }),
    ),
  );
  const date = new Date().toISOString().slice(0, 10);
  const runId = `baseline-${date}`;
  await writeRunJson(rows, runId);
  await writeRunMarkdown(rows, runId);
  await promoteBaseline(rows, date);
  console.log(`Baseline written. ${rows.length} journeys graded.`);
}
