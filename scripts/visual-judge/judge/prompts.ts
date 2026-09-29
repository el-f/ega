/** Pure prompt builders: no filesystem reads, no model calls. */
import type { ShotMeta } from './types';

export function composeShotPrompt(rubric: string, meta: ShotMeta): string {
  const lines: string[] = [rubric, '', '---', '', '## This capture'];
  lines.push(`- **surface:** ${meta.surface}`);
  lines.push(`- **state:** ${meta.state}`);
  if (meta.theme) lines.push(`- **theme:** ${meta.theme}`);
  if (meta.viewport) lines.push(`- **viewport:** ${meta.viewport.width}×${meta.viewport.height}`);
  if (meta.userAction) lines.push(`- **user action:** ${meta.userAction}`);
  if (meta.expectations && meta.expectations.length) {
    lines.push('- **expectations:**');
    for (const e of meta.expectations) lines.push(`  - ${e}`);
  }
  lines.push('');
  lines.push(
    'Judge against the rubric above AND the captured state. Return ONLY one JSON object as specified in the base rubric.',
  );
  return lines.join('\n');
}

export interface FeaturePromptInput {
  featureId: string;
  rubric: string;
  shots: { name: string; meta: ShotMeta }[];
  codeSnippets: { path: string; contents: string }[];
  researchTopics: string[];
  toolsEnabled: boolean;
}

export function composeFeaturePrompt(input: FeaturePromptInput): string {
  const { featureId, rubric, shots, codeSnippets, researchTopics, toolsEnabled } = input;
  const lines: string[] = [];
  lines.push(`# Feature audit — ${featureId}`);
  lines.push('');
  lines.push(
    'You are auditing one whole feature of the Ega Chrome extension. You see every screenshot of the feature side by side, the surface rubric, and the source files that implement it. Your job is not to grade single shots — it is to think across them and propose changes that make this feature better.',
  );
  lines.push('');
  lines.push('## Rubric');
  lines.push('');
  lines.push(rubric);
  lines.push('');
  lines.push('## Captures');
  for (const s of shots) {
    lines.push('');
    lines.push(`### ${s.name}`);
    lines.push(`- surface: ${s.meta.surface}`);
    lines.push(`- state: ${s.meta.state}`);
    if (s.meta.theme) lines.push(`- theme: ${s.meta.theme}`);
    if (s.meta.userAction) lines.push(`- user action: ${s.meta.userAction}`);
    if (s.meta.expectations && s.meta.expectations.length) {
      lines.push('- expectations:');
      for (const e of s.meta.expectations) lines.push(`  - ${e}`);
    }
  }
  if (codeSnippets.length) {
    lines.push('');
    lines.push('## Source code (inline, truncated to fit budget)');
    for (const c of codeSnippets) {
      lines.push('');
      lines.push(`### ${c.path}`);
      lines.push('```');
      lines.push(c.contents);
      lines.push('```');
    }
  }
  if (researchTopics.length) {
    lines.push('');
    lines.push('## Suggested research topics');
    lines.push(
      'These are pointers, not orders. Use WebFetch only if the question genuinely depends on current external practice.',
    );
    for (const t of researchTopics) lines.push(`- ${t}`);
  }
  if (toolsEnabled) {
    lines.push('');
    lines.push('## Tool access');
    lines.push(
      'You have Read + Grep + WebFetch available. Read additional source files only if the inlined code is not enough. Stay inside the repository; do not modify files.',
    );
  }
  lines.push('');
  lines.push('## Output contract');
  lines.push(
    'Return EXACTLY one JSON object on the last line of your response. No prose outside that JSON. Shape:',
  );
  lines.push('```');
  lines.push(
    JSON.stringify(
      {
        summary: '<one-sentence theme of the audit>',
        must_haves: [
          {
            id: 'slug-form-id',
            priority: 'P0',
            what: 'one-line UX or functionality gap',
            why: 'why it matters — user impact, not aesthetic preference',
            where: ['src/path/to/file.svelte:42'],
            effort: 'small|medium|large',
            risk: 'low|medium|high',
          },
        ],
        should_haves: [],
        could_haves: [],
        overhauls: [
          {
            id: 'slug',
            priority: 'P0',
            what: 'feature-level rethink',
            why: '...',
            where: [],
            effort: 'large',
            risk: 'medium',
          },
        ],
        robustness: [
          {
            id: 'slug',
            priority: 'P1',
            what: 'code maintainability / robustness fix',
            why: '...',
            where: ['src/...'],
            effort: 'small',
            risk: 'low',
          },
        ],
      },
      null,
      2,
    ),
  );
  lines.push('```');
  lines.push('');
  lines.push(
    'Rules: priority `P0` = ships next release, `P1` = ships next major, `P2` = nice-to-have. ID is a stable slug — same audit re-run on the same feature should produce the same IDs for the same findings. Never list a recommendation without `why` or without `where` (unless overhaul). If you have nothing for a bucket, return an empty array.',
  );
  return lines.join('\n');
}
