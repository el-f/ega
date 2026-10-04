/** Writes each feature proposal as Markdown for a person and JSON for tools, under `tests/screenshots/audit/proposals/`. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FeatureProposal, ProposalItem, Priority } from '../judge/types';

function fmtItem(item: ProposalItem): string {
  const lines: string[] = [];
  lines.push(`### ${item.id} — ${item.priority}`);
  lines.push(`- **What:** ${item.what}`);
  if (item.why) lines.push(`- **Why:** ${item.why}`);
  if (item.where && item.where.length) lines.push(`- **Where:** ${item.where.join(', ')}`);
  if (item.effort) lines.push(`- **Effort:** ${item.effort}`);
  if (item.risk) lines.push(`- **Risk:** ${item.risk}`);
  return lines.join('\n');
}

function sortByPriority(items: ProposalItem[]): ProposalItem[] {
  const order: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };
  return [...items].sort((a, b) => order[a.priority] - order[b.priority]);
}

export function renderProposalMd(p: FeatureProposal): string {
  const lines: string[] = [];
  lines.push(`# ${p.feature} audit — ${p.generated_at.slice(0, 10)}`);
  lines.push('');
  if (p.cli_error) {
    lines.push('> **CLI error during audit.** Re-run via `pnpm visual:propose ' + p.feature + '`.');
    lines.push('');
  }
  if (p.summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(p.summary);
    lines.push('');
  }
  const sections: { title: string; items: ProposalItem[] }[] = [
    { title: 'Must-haves (P0)', items: sortByPriority(p.must_haves) },
    { title: 'Should-haves (P1)', items: sortByPriority(p.should_haves) },
    { title: 'Could-haves (P2)', items: sortByPriority(p.could_haves) },
    { title: 'Overhauls', items: sortByPriority(p.overhauls) },
    { title: 'Code robustness / maintainability', items: sortByPriority(p.robustness) },
  ];
  for (const sec of sections) {
    lines.push(`## ${sec.title}`);
    lines.push('');
    if (!sec.items.length) {
      lines.push('_None._');
      lines.push('');
      continue;
    }
    for (const it of sec.items) {
      lines.push(fmtItem(it));
      lines.push('');
    }
  }
  return lines.join('\n');
}

export async function writeProposal(
  proposalsDir: string,
  p: FeatureProposal,
): Promise<{ mdPath: string; jsonPath: string }> {
  await mkdir(proposalsDir, { recursive: true });
  const mdPath = path.join(proposalsDir, `${p.feature}.md`);
  const jsonPath = path.join(proposalsDir, `${p.feature}.json`);
  await writeFile(mdPath, renderProposalMd(p));
  await writeFile(jsonPath, JSON.stringify(p, null, 2));
  return { mdPath, jsonPath };
}
