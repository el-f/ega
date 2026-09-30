/** audit: single-pass grade of a filtered subset (no ensemble). */
import { loadJourneys } from '../loader/journeys';
import { composeRubric } from '../loader/rubric';
import { composeJudgePrompt } from '../judge/prompt';
import { callJudge } from '../judge/call';
import { CONFIG } from '../config';
import { writeRunJson, type RunRow } from '../report/json';
import { writeRunMarkdown } from '../report/md';

export async function audit(args: ReadonlyArray<string>): Promise<void> {
  const filterIdx = args.indexOf('--filter');
  const filter = filterIdx >= 0 ? args[filterIdx + 1] : undefined;
  const journeys = await loadJourneys(filter);
  if (journeys.length === 0) {
    console.log(`No journeys matched${filter ? ` filter "${filter}"` : ''}.`);
    return;
  }
  const rows: RunRow[] = [];
  for (const j of journeys) {
    const rubric = await composeRubric(j.coverage);
    const verdict = await callJudge(composeJudgePrompt(rubric, j), 'baseline');
    rows.push({
      coverage: j.coverage,
      verdict,
      judgeModel: CONFIG.judgeModel.baseline,
      at: new Date().toISOString(),
    });
  }
  const id = `audit-${Date.now()}`;
  await writeRunJson(rows, id);
  const mdFile = await writeRunMarkdown(rows, id);
  console.log(`Audit written. ${rows.length} journeys graded. See ${mdFile}`);
}
