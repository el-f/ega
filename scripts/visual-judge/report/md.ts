/** Renders the human-readable `REPORT.md` summary. */
import { writeFile } from 'node:fs/promises';
import type { BatchReport } from '../judge/types';

function renderMd(report: BatchReport): string {
  const lines: string[] = [];
  lines.push(`# Visual audit — ${report.generated_at}`);
  lines.push('');
  lines.push(
    `**Totals:** ${report.total} screens · ${report.ok} ok · ${report.minor} minor · ${report.major} major · ${report.inconclusive} inconclusive · ${report.unchanged} unchanged · ${report.cli_errors} cli-errors`,
  );
  lines.push('');
  const major = report.files.filter((f) => f.overall === 'major-issues');
  const minor = report.files.filter((f) => f.overall === 'minor-issues');
  const inconclusive = report.files.filter((f) => f.overall === 'inconclusive');
  const errs = report.files.filter((f) => f.overall === 'cli-error' || f.overall === 'unparseable');
  if (major.length) {
    lines.push('## P0 (major)');
    lines.push('');
    for (const f of major) {
      lines.push(`### ${f.file} — ${f.surface} / ${f.state}`);
      for (const i of f.issues.filter((x) => x.severity === 'major')) {
        const fix = i.fix_hint ? ` — fix: ${i.fix_hint}` : '';
        lines.push(`- **${i.axis ?? 'other'}:** ${i.description}${fix}`);
      }
      lines.push('');
    }
  }
  if (minor.length) {
    lines.push('## P1 (minor)');
    lines.push('');
    for (const f of minor) {
      lines.push(`### ${f.file} — ${f.surface} / ${f.state}`);
      for (const i of f.issues)
        lines.push(`- ${i.severity}: ${i.description} (${i.axis ?? 'other'})`);
      lines.push('');
    }
  }
  if (inconclusive.length) {
    lines.push('## Inconclusive (LLM verdict flipped across rolls)');
    lines.push('');
    for (const f of inconclusive) lines.push(`- ${f.file} — ${f.surface} / ${f.state}`);
    lines.push('');
  }
  if (errs.length) {
    lines.push('## CLI / parse errors');
    for (const f of errs) lines.push(`- ${f.file} — ${f.overall}`);
  }
  return lines.join('\n');
}

export async function writeReportMd(path: string, report: BatchReport): Promise<void> {
  await writeFile(path, renderMd(report));
}
