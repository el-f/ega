import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadRubric, loadFeatureRubric } from '../../../scripts/visual-judge/loader/rubric';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'rubric-test-'));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, '_base.md'), '# base');
  await writeFile(path.join(dir, 'tooltip.md'), '# tooltip');
  await writeFile(path.join(dir, 'popup.md'), '# popup');
  await writeFile(path.join(dir, 'unknown.md'), '# unknown');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadRubric', () => {
  it('concatenates base + surface', async () => {
    const text = await loadRubric(dir, 'tooltip');
    expect(text.startsWith('# base')).toBe(true);
    expect(text).toContain('# tooltip');
    expect(text.indexOf('# base')).toBeLessThan(text.indexOf('# tooltip'));
  });

  it('falls back to unknown.md for missing surfaces', async () => {
    const text = await loadRubric(dir, 'doesnotexist');
    expect(text).toContain('# unknown');
  });
});

describe('loadFeatureRubric', () => {
  it('includes every requested surface once, base first', async () => {
    const text = await loadFeatureRubric(dir, ['tooltip', 'popup', 'tooltip']);
    expect(text.startsWith('# base')).toBe(true);
    expect(text).toContain('# tooltip');
    expect(text).toContain('# popup');
    // dedupe: only one tooltip section
    expect(text.match(/# tooltip/g)?.length).toBe(1);
  });

  it('ignores unknown surfaces silently (base remains)', async () => {
    const text = await loadFeatureRubric(dir, ['mystery']);
    expect(text.trim()).toBe('# base');
  });
});
