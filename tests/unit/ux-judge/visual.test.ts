import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  systemPrompt,
  buildVisualContent,
  renderReport,
  discoverManifests,
  loadFrames,
  type LoadedFrame,
  type JourneyManifest,
} from '../../../scripts/ux-judge/cli/visual';
import { composeRubric } from '../../../scripts/ux-judge/loader/rubric';

// 1x1 transparent PNG — the smallest valid frame for the round-trip test.
const PNG_1x1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const frame = (label: string): LoadedFrame => ({
  label,
  mediaType: 'image/png',
  base64: PNG_1x1_B64,
});

describe('ux-judge visual — pure logic', () => {
  it('systemPrompt names the JSON verdict contract', () => {
    const s = systemPrompt();
    expect(s).toContain('severity');
    expect(s).toContain('findings');
    expect(s).toContain('suggestions');
    // Sequence-aware framing, not single-surface.
    expect(s.toLowerCase()).toContain('journey');
  });

  it('buildVisualContent interleaves one image block per step + rubric + closing instruction', () => {
    const frames = [frame('open'), frame('type'), frame('send')];
    const blocks = buildVisualContent('translation.sidepanel.input-send', 'RUBRIC BODY', frames);

    const images = blocks.filter((b) => b.type === 'image');
    expect(images).toHaveLength(3);
    for (const img of images) {
      expect(img.source.media_type).toBe('image/png');
      expect(img.source.data).toBe(PNG_1x1_B64);
    }

    // First block carries the coverage id + rubric.
    const first = blocks[0];
    expect(first?.type).toBe('text');
    if (first?.type === 'text') {
      expect(first.text).toContain('translation.sidepanel.input-send');
      expect(first.text).toContain('RUBRIC BODY');
    }

    // Each step label appears as a text block.
    const texts = blocks.flatMap((b) => (b.type === 'text' ? [b.text] : []));
    expect(texts.some((t) => t.includes('Step 1: open'))).toBe(true);
    expect(texts.some((t) => t.includes('Step 3: send'))).toBe(true);

    // Last block is the grade instruction (JSON only).
    const last = blocks[blocks.length - 1];
    expect(last?.type).toBe('text');
    if (last?.type === 'text') expect(last.text).toMatch(/ONLY the JSON/i);
  });

  it('renderReport prints "No findings." for a clean verdict', () => {
    const md = renderReport('x.y.z', { severity: 'ok', findings: [], suggestions: [] });
    expect(md).toContain('## x.y.z — ok');
    expect(md).toContain('No findings.');
  });

  it('renderReport lists findings + suggestions', () => {
    const md = renderReport('a.b.c', {
      severity: 'major',
      findings: [{ axis: 'contrast', where: 'step 2 (mic)', issue: '2.1:1 at rest' }],
      suggestions: ['drop the 0.5 opacity'],
    });
    expect(md).toContain('## a.b.c — major');
    expect(md).toContain('[contrast] step 2 (mic)');
    expect(md).toContain('2.1:1 at rest');
    expect(md).toContain('### Suggestions');
    expect(md).toContain('drop the 0.5 opacity');
  });

  it('discoverManifests + loadFrames round-trip a captured journey from disk', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ega-vjj-'));
    const dir = path.join(root, 'translation--sidepanel--input-send');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, '00.png'), Buffer.from(PNG_1x1_B64, 'base64'));
    await fs.writeFile(path.join(dir, '01.png'), Buffer.from(PNG_1x1_B64, 'base64'));
    const manifest: JourneyManifest = {
      coverage: 'translation.sidepanel.input-send',
      steps: [
        { idx: 1, label: 'type', frame: '01.png' },
        { idx: 0, label: 'open', frame: '00.png' },
      ],
    };
    await fs.writeFile(path.join(dir, 'journey.json'), JSON.stringify(manifest));

    const found = await discoverManifests(root);
    expect(found).toHaveLength(1);
    expect(found[0]?.manifest.coverage).toBe('translation.sidepanel.input-send');

    // loadFrames sorts by idx, so 'open' (0) comes before 'type' (1).
    const frames = await loadFrames(manifest, dir);
    expect(frames.map((f) => f.label)).toEqual(['open', 'type']);
    expect(frames[0]?.base64).toBe(PNG_1x1_B64);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('discoverManifests filters by coverage glob', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ega-vjj-'));
    for (const cov of ['translation.sidepanel.input-send', 'options.context-menu.manage']) {
      const dir = path.join(root, cov.replace(/\./g, '--'));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'journey.json'),
        JSON.stringify({ coverage: cov, steps: [] }),
      );
    }
    const translationOnly = await discoverManifests(root, 'translation.*');
    expect(translationOnly.map((m) => m.manifest.coverage)).toEqual([
      'translation.sidepanel.input-send',
    ]);

    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('visual-journeys capture spec', () => {
  it('captures only coverage ids that have a rubric', async () => {
    const spec = await fs.readFile('tests/e2e/visual-journeys.spec.ts', 'utf-8');
    const calls = spec.match(/(?<!function )captureJourney\(/g) ?? [];
    const ids = [...spec.matchAll(/captureJourney\(\s*\w+,\s*'([^']+)'/g)].map((m) => m[1] ?? '');
    expect(calls.length).toBeGreaterThan(0);
    expect(ids).toHaveLength(calls.length);
    for (const id of ids) await expect(composeRubric(id), id).resolves.toContain('---');
  });
});
