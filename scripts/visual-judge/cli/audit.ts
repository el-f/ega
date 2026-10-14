import { buildPaths, type JudgePaths } from '../config';
import { FEATURES, findFeature } from '../features';
import { auditFeature } from '../audit/feature';
import { writeProposal } from '../audit/proposals';

export interface AuditCliOptions {
  paths?: JudgePaths;
  featureIds?: string[];
  toolsEnabled?: boolean;
  timeoutMs?: number;
}

export async function runAudit(opts: AuditCliOptions = {}): Promise<{ exitCode: number }> {
  const paths = opts.paths ?? buildPaths();
  const targets =
    opts.featureIds && opts.featureIds.length
      ? opts.featureIds.flatMap((id) => {
          const f = findFeature(id);
          if (!f) console.warn(`Unknown feature id: ${id} — skipping`);
          return f ? [f] : [];
        })
      : FEATURES;
  if (!targets.length) {
    console.error('No features to audit.');
    return { exitCode: 2 };
  }

  console.log(`Auditing ${targets.length} feature(s)…`);
  let errors = 0;
  for (const feature of targets) {
    process.stdout.write(`  ${feature.id} … `);
    const auditOpts: Parameters<typeof auditFeature>[1] = { paths };
    if (opts.toolsEnabled) auditOpts.toolsEnabled = true;
    if (opts.timeoutMs !== undefined) auditOpts.timeoutMs = opts.timeoutMs;
    try {
      const result = await auditFeature(feature, auditOpts);
      const { mdPath } = await writeProposal(paths.proposalsDir, result.proposal);
      const counts = [
        `${result.proposal.must_haves.length} P0`,
        `${result.proposal.should_haves.length} P1`,
        `${result.proposal.could_haves.length} P2`,
        `${result.proposal.overhauls.length} overhauls`,
        `${result.proposal.robustness.length} robustness`,
      ].join(' · ');
      const shotInfo =
        result.shotsAvailable > result.shotsUsed.length
          ? `${result.shotsUsed.length}/${result.shotsAvailable} shots sampled`
          : `${result.shotsUsed.length} shots`;
      console.log(
        `${counts} · ${shotInfo}${result.proposal.cli_error ? ' · CLI-ERROR' : ''} → ${mdPath}`,
      );
      if (result.proposal.cli_error) errors += 1;
    } catch (e) {
      errors += 1;
      console.error(`FAIL — ${(e as Error).message}`);
    }
  }
  console.log(`Done. ${targets.length - errors}/${targets.length} feature audits succeeded.`);
  return { exitCode: errors > 0 ? 1 : 0 };
}
