/** Grades a journey's ORDERED screenshots, which the other judges never see: pnpm visual:journeys:judge [--filter "translation.*"] [--strict] */
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, SEVERITY_ORDER } from '../config';
import { globToRegex } from '../loader/journeys';
import { composeRubric } from '../loader/rubric';
import { callJudge } from '../judge/call';
import type { JudgeVerdict } from '../judge/parse';
import type { JudgeUserBlock } from '../judge/prompt';

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
): JudgeUserBlock[] {
  const blocks: JudgeUserBlock[] = [
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
  framesRoot = CONFIG.framesRoot,
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

export async function visual(
  args: ReadonlyArray<string>,
  roots: { framesRoot: string; reportRoot: string } = CONFIG,
): Promise<void> {
  const strict = args.includes('--strict');
  const fi = args.indexOf('--filter');
  const filter = fi >= 0 ? args[fi + 1] : undefined;

  const manifests = await discoverManifests(roots.framesRoot, filter);
  if (manifests.length === 0) {
    console.log(
      `ux-judge visual: no journeys under ${roots.framesRoot}. ` +
        'Run `pnpm visual:journeys:capture` first.',
    );
    return;
  }

  const reportDir = path.join(roots.reportRoot, 'visual');
  await fs.mkdir(reportDir, { recursive: true });
  const summary: Array<{ coverage: string; severity: JudgeVerdict['severity']; findings: number }> =
    [];
  const failed: string[] = [];
  let worst = 0;

  for (const { manifest, dir } of manifests) {
    let verdict: JudgeVerdict;
    try {
      const rubric = await composeRubric(manifest.coverage).catch((e: unknown) => {
        throw new Error(`${(e as Error).message} (stale capture? delete ${dir})`);
      });
      const frames = await loadFrames(manifest, dir);
      const user = buildVisualContent(manifest.coverage, rubric, frames);
      verdict = await callJudge(
        { system: [{ type: 'text', text: systemPrompt() }], user },
        'baseline',
      );
    } catch (e) {
      console.error(`✗ ${manifest.coverage}: ${(e as Error).message}`);
      failed.push(manifest.coverage);
      continue;
    }
    await fs.writeFile(
      path.join(reportDir, `${manifest.coverage.replace(/\./g, '--')}.md`),
      renderReport(manifest.coverage, verdict),
    );
    summary.push({
      coverage: manifest.coverage,
      severity: verdict.severity,
      findings: verdict.findings.length,
    });
    worst = Math.max(worst, SEVERITY_ORDER[verdict.severity]);
    const mark = verdict.severity === 'ok' ? '✓' : '•';
    console.log(
      `${mark} ${manifest.coverage} — ${verdict.severity} (${verdict.findings.length} findings)`,
    );
  }

  await fs.writeFile(path.join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2));

  if (failed.length > 0) {
    console.error(`ux-judge visual: ${failed.length} journey(s) not judged: ${failed.join(', ')}`);
    process.exit(1);
  }
  if (strict && worst >= SEVERITY_ORDER.blocker) {
    console.error('ux-judge visual: blocker findings present (--strict).');
    process.exit(1);
  }
}
