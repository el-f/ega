import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config';
import type { Severity } from '../config';
import type { RunRow } from './json';

/** Writes the run report and returns its path. Rows graded `ok` get no section. */
export async function writeRunMarkdown(
  rows: ReadonlyArray<RunRow>,
  runId: string,
): Promise<string> {
  await fs.mkdir(CONFIG.reportRoot, { recursive: true });
  const buckets: Record<Severity, number> = { ok: 0, minor: 0, major: 0, blocker: 0 };
  for (const r of rows) buckets[r.verdict.severity] += 1;
  const lines: string[] = [];
  lines.push(`# UX judge run \`${runId}\``);
  lines.push('');
  lines.push(
    `Summary: ok ${buckets.ok} · minor ${buckets.minor} · major ${buckets.major} · **blocker ${buckets.blocker}**`,
  );
  lines.push('');
  for (const r of rows) {
    if (r.verdict.severity === 'ok') continue;
    lines.push(`## \`${r.coverage}\` — ${r.verdict.severity}`);
    for (const f of r.verdict.findings) {
      lines.push(`- **${f.axis}** (${f.where}): ${f.issue}`);
    }
    if (r.verdict.suggestions.length) {
      lines.push('');
      lines.push('Suggestions:');
      for (const s of r.verdict.suggestions) lines.push(`- ${s}`);
    }
    lines.push('');
  }
  const file = path.join(CONFIG.reportRoot, `${runId}.md`);
  await fs.writeFile(file, lines.join('\n'));
  return file;
}
