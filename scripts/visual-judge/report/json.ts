/** Writes report.json, read by `cli/baseline.ts`. */
import { writeFile } from 'node:fs/promises';
import type { BatchReport, FileVerdict } from '../judge/types';

export function buildBatchReport(files: FileVerdict[]): BatchReport {
  return {
    generated_at: new Date().toISOString(),
    total: files.length,
    ok: files.filter((f) => f.overall === 'ok').length,
    minor: files.filter((f) => f.overall === 'minor-issues').length,
    major: files.filter((f) => f.overall === 'major-issues').length,
    unchanged: files.filter((f) => f.inherited_from_baseline === true).length,
    cli_errors: files.filter((f) => f.overall === 'cli-error' || f.overall === 'unparseable')
      .length,
    inconclusive: files.filter((f) => f.overall === 'inconclusive').length,
    files,
  };
}

export async function writeReportJson(path: string, report: BatchReport): Promise<void> {
  await writeFile(path, JSON.stringify(report, null, 2));
}
