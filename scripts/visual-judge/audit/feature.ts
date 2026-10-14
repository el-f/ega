import { buildPaths, FEATURE_TIMEOUT_MS, MAX_SHOTS_PER_FEATURE, type JudgePaths } from '../config';
import { listCurrentShots, currentPathFor } from '../loader/capture';
import { loadMeta } from '../loader/meta';
import { loadFeatureRubric } from '../loader/rubric';
import { groupShots, sampleShots } from './grouping';
import { loadCodeSnippets } from './code';
import { composeFeaturePrompt } from '../judge/prompts';
import { callClaudeOnFeature } from '../judge/cli';
import { parseFeatureProposal } from '../judge/parser';
import type { Feature } from '../features';
import type { FeatureProposal, ShotMeta } from '../judge/types';

export interface AuditOptions {
  paths?: JudgePaths;
  toolsEnabled?: boolean;
  timeoutMs?: number;
  /** Override the default sample cap (mainly for tests). */
  maxShots?: number;
}

export interface AuditResult {
  proposal: FeatureProposal;
  shotsUsed: string[];
  shotsAvailable: number;
  codePathsInlined: number;
}

export async function auditFeature(
  feature: Feature,
  opts: AuditOptions = {},
): Promise<AuditResult> {
  const paths = opts.paths ?? buildPaths();
  const allShots = await listCurrentShots(paths);
  const [group] = groupShots(allShots, [feature]);
  const matched = group?.shots ?? [];
  if (!matched.length) {
    return {
      proposal: {
        feature: feature.id,
        generated_at: new Date().toISOString(),
        summary: 'No captures matched this feature — nothing to audit.',
        must_haves: [],
        should_haves: [],
        could_haves: [],
        overhauls: [],
        robustness: [],
      },
      shotsUsed: [],
      shotsAvailable: 0,
      codePathsInlined: 0,
    };
  }
  const cap = opts.maxShots ?? MAX_SHOTS_PER_FEATURE;
  const sampled = sampleShots(matched, cap);

  const metas: { name: string; meta: ShotMeta }[] = [];
  for (const file of sampled) {
    const name = file.replace(/\.png$/, '');
    metas.push({ name: file, meta: await loadMeta(paths.metaDir, name) });
  }

  const rubric = await loadFeatureRubric(paths.rubricDir, feature.surfaces);
  const codeSnippets = await loadCodeSnippets(paths.root, feature.codePaths);

  const prompt = composeFeaturePrompt({
    featureId: feature.id,
    rubric,
    shots: metas,
    codeSnippets,
    researchTopics: feature.researchTopics,
    toolsEnabled: !!opts.toolsEnabled,
  });
  const imagePaths = sampled.map((f) => currentPathFor(paths, f));
  const cliInput: Parameters<typeof callClaudeOnFeature>[0] = {
    prompt,
    imagePaths,
    timeoutMs: opts.timeoutMs ?? FEATURE_TIMEOUT_MS,
  };
  if (opts.toolsEnabled) {
    cliInput.allowedTools = ['Read', 'Grep', 'Glob', 'WebFetch'];
    cliInput.addDirs = [paths.root];
  }
  const stream = await callClaudeOnFeature(cliInput);
  const proposal = parseFeatureProposal(feature.id, stream);
  return {
    proposal,
    shotsUsed: sampled,
    shotsAvailable: matched.length,
    codePathsInlined: codeSnippets.length,
  };
}
