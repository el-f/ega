#!/usr/bin/env tsx
// Grades a journey's ORDERED screenshots, which the sibling judges never see: pnpm visual:journeys:judge [--filter "sidepanel.*"] [--strict]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from './ux-judge/config';
import { globToRegex } from './ux-judge/loader/journeys';
import { composeRubric } from './ux-judge/loader/rubric';
import { parseJudgeVerdict, type JudgeVerdict } from './ux-judge/judge/parse';

export const FRAMES_ROOT = path.resolve('tests/journeys/frames');
export const VISUAL_REPORT_ROOT = path.resolve('tests/journeys/report/visual');

/** One captured step of a journey: a label + the screenshot taken right after it. */
export interface JourneyFrameStep {
  idx: number;
  label: string;
  /** PNG path relative to the journey manifest directory. */
  frame: string;
}

/** `tests/journeys/frames/<coverage>/journey.json`, written by the capture spec. */
export interface JourneyManifest {
  coverage: string;
  steps: JourneyFrameStep[];
}

/** A frame loaded as base64 + its label, ready to become a content block. */
export interface LoadedFrame {
  label: string;
  mediaType: 'image/png';
  base64: string;
}

/** Anthropic content blocks accepted by `messages.create` (text | image). */
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } };

/** Asks for the same JSON shape `parseJudgeVerdict` expects, so both judges write one report format. */
export function systemPrompt(): string {
  return [
    'You are a senior UI/UX reviewer grading a user JOURNEY through the Ega Chrome extension.',
    'You are given an ORDERED sequence of screenshots — one per step of a single real interaction —',
    'plus the per-action rubric. Judge the journey as a user actually experiences it: does each',
    'transition do the right thing and LOOK right? Flag anything broken, stuck, misaligned, low-contrast,',
    'mislabeled, or confusing AT A SPECIFIC STEP. Cross-reference against the rubric. Do not invent',
    'issues to fill the list — "ok" with no findings is the correct verdict for a clean journey.',
    '',
    'Severity: blocker = the journey cannot be completed / data is wrong. major = a clear bug or',
    'broken/confusing state a user will hit. minor = polish/inconsistency. ok = clean.',
    '',
    'Reply with ONLY JSON, no prose, this exact shape:',
    '{"severity":"ok|minor|major|blocker",',
    ' "findings":[{"axis":"correctness|layout|contrast|copy|a11y|state","where":"step N (what)","issue":"..."}],',
    ' "suggestions":["short fix idea", "..."]}',
  ].join('\n');
}

/** Rubric + intro, then a label and image per step, then the closing instruction. Pure, so tests need no browser. */
export function buildVisualContent(
  coverage: string,
  rubric: string,
  frames: ReadonlyArray<LoadedFrame>,
): ContentBlock[] {
  const blocks: ContentBlock[] = [
    {
      type: 'text',
      text:
        `Journey: ${coverage}\n\n` +
        `RUBRIC:\n${rubric}\n\n` +
        `Below are the ${frames.length} steps of this journey in order. ` +
        `Each screenshot is the state right AFTER the labeled action.`,
    },
  ];
  frames.forEach((f, i) => {
    blocks.push({ type: 'text', text: `Step ${i + 1}: ${f.label}` });
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: f.mediaType, data: f.base64 },
    });
  });
  blocks.push({
    type: 'text',
    text: 'Grade the whole sequence now. Reply with ONLY the JSON verdict.',
  });
  return blocks;
}

/** Discover every `<coverage>/journey.json` under the frames root. */
export async function discoverManifests(
  framesRoot = FRAMES_ROOT,
  filter?: string,
): Promise<Array<{ manifest: JourneyManifest; dir: string }>> {
  const dirents = await fs.readdir(framesRoot, { withFileTypes: true }).catch(() => []);
  const re = filter ? globToRegex(filter) : null;
  const out: Array<{ manifest: JourneyManifest; dir: string }> = [];
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const dir = path.join(framesRoot, d.name);
    const manifestPath = path.join(dir, 'journey.json');
    const body = await fs.readFile(manifestPath, 'utf-8').catch(() => null);
    if (body === null) continue;
    let manifest: JourneyManifest;
    try {
      manifest = JSON.parse(body) as JourneyManifest;
    } catch {
      console.warn(`⚠ bad journey.json in ${d.name} — skipped`);
      continue;
    }
    if (re && !re.test(manifest.coverage)) continue;
    out.push({ manifest, dir });
  }
  return out;
}

/** Load a manifest's frames as base64 from disk (frame paths are dir-relative). */
export async function loadFrames(manifest: JourneyManifest, dir: string): Promise<LoadedFrame[]> {
  const frames: LoadedFrame[] = [];
  for (const step of manifest.steps.slice().sort((a, b) => a.idx - b.idx)) {
    const buf = await fs.readFile(path.join(dir, step.frame));
    frames.push({ label: step.label, mediaType: 'image/png', base64: buf.toString('base64') });
  }
  return frames;
}

/** Render one journey verdict as Markdown. */
export function renderReport(coverage: string, verdict: JudgeVerdict): string {
  const lines = [`## ${coverage} — ${verdict.severity}`, ''];
  if (verdict.findings.length === 0) {
    lines.push('No findings.');
  } else {
    for (const f of verdict.findings) {
      lines.push(`- **[${f.axis}] ${f.where}** — ${f.issue}`);
    }
  }
  if (verdict.suggestions.length > 0) {
    lines.push('', '### Suggestions');
    for (const s of verdict.suggestions) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

async function callVisualJudge(content: ContentBlock[]): Promise<JudgeVerdict> {
  const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  const resp = await client.messages.create({
    model: CONFIG.judgeModel.baseline,
    max_tokens: CONFIG.maxTokens,
    system: systemPrompt(),
    // Cast: the SDK's content-block union is wider than our text|image subset.
    messages: [{ role: 'user', content: content as never }],
  });
  const text = resp.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return parseJudgeVerdict(text);
}

const SEVERITY_RANK: Record<JudgeVerdict['severity'], number> = {
  ok: 0,
  minor: 1,
  major: 2,
  blocker: 3,
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const fi = args.indexOf('--filter');
  const filter = fi >= 0 ? args[fi + 1] : undefined;

  if (!process.env['ANTHROPIC_API_KEY']) {
    console.log('visual-journey-judge: no ANTHROPIC_API_KEY — skipping (clean).');
    return;
  }

  const manifests = await discoverManifests(FRAMES_ROOT, filter);
  if (manifests.length === 0) {
    console.log(
      `visual-journey-judge: no journeys under ${FRAMES_ROOT}. ` +
        'Run `pnpm visual:journeys:capture` first.',
    );
    return;
  }

  await fs.mkdir(VISUAL_REPORT_ROOT, { recursive: true });
  const summary: Array<{ coverage: string; severity: JudgeVerdict['severity']; findings: number }> =
    [];
  let worst = 0;

  for (const { manifest, dir } of manifests) {
    const rubric = await composeRubric(manifest.coverage).catch(
      () => '(no rubric found for this coverage id)',
    );
    const frames = await loadFrames(manifest, dir);
    const content = buildVisualContent(manifest.coverage, rubric, frames);
    let verdict: JudgeVerdict;
    try {
      verdict = await callVisualJudge(content);
    } catch (e) {
      console.error(`✗ ${manifest.coverage}: ${(e as Error).message}`);
      continue;
    }
    await fs.writeFile(
      path.join(VISUAL_REPORT_ROOT, `${manifest.coverage.replace(/\./g, '--')}.md`),
      renderReport(manifest.coverage, verdict),
    );
    summary.push({
      coverage: manifest.coverage,
      severity: verdict.severity,
      findings: verdict.findings.length,
    });
    worst = Math.max(worst, SEVERITY_RANK[verdict.severity]);
    const mark = verdict.severity === 'ok' ? '✓' : '•';
    console.log(
      `${mark} ${manifest.coverage} — ${verdict.severity} (${verdict.findings.length} findings)`,
    );
  }

  await fs.writeFile(
    path.join(VISUAL_REPORT_ROOT, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );

  if (strict && worst >= SEVERITY_RANK.blocker) {
    console.error('visual-journey-judge: blocker findings present (--strict).');
    process.exit(1);
  }
}

// Only auto-run as the entry script; importing for tests must not call the API.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}

// Re-export for callers that want the resolved entry path.
export const __entry = fileURLToPath(import.meta.url);
