/** composeRubric joins _base.md, family, surface and action.md with --- rules. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { composeRubric } from '../../../scripts/ux-judge/loader/rubric';
import { CONFIG } from '../../../scripts/ux-judge/config';

const F = path.join(CONFIG.rubricRoot, 'translation');
const FAMILY_BASE = path.join(F, '_base.md');
const SURFACE_DIR = path.join(F, 'tooltip');
const SURFACE_BASE = path.join(SURFACE_DIR, '_base.md');
const ACTION_FILE = path.join(SURFACE_DIR, 'copy-button.md');
const UNIVERSAL_BASE = path.join(CONFIG.rubricRoot, '_base.md');

let priorFamily: string | null = null;
let priorSurface: string | null = null;
let priorAction: string | null = null;
let priorUniversal: string | null = null;

describe('composeRubric', () => {
  beforeAll(async () => {
    priorUniversal = await fs.readFile(UNIVERSAL_BASE, 'utf-8').catch(() => null);
    priorFamily = await fs.readFile(FAMILY_BASE, 'utf-8').catch(() => null);
    priorSurface = await fs.readFile(SURFACE_BASE, 'utf-8').catch(() => null);
    priorAction = await fs.readFile(ACTION_FILE, 'utf-8').catch(() => null);
    await fs.mkdir(SURFACE_DIR, { recursive: true });
    await fs.writeFile(UNIVERSAL_BASE, 'UNIVERSAL\n');
    await fs.writeFile(FAMILY_BASE, 'FAMILY\n');
    await fs.writeFile(SURFACE_BASE, 'SURFACE\n');
    await fs.writeFile(ACTION_FILE, 'ACTION\n');
  });

  afterAll(async () => {
    if (priorUniversal !== null) await fs.writeFile(UNIVERSAL_BASE, priorUniversal);
    if (priorFamily !== null) await fs.writeFile(FAMILY_BASE, priorFamily);
    else await fs.rm(FAMILY_BASE, { force: true });
    if (priorSurface !== null) await fs.writeFile(SURFACE_BASE, priorSurface);
    else await fs.rm(SURFACE_BASE, { force: true });
    if (priorAction !== null) await fs.writeFile(ACTION_FILE, priorAction);
    else await fs.rm(ACTION_FILE, { force: true });
  });

  it('walks universal -> family -> surface -> action in order', async () => {
    const composed = await composeRubric('translation.tooltip.copy-button');
    expect(composed).toContain('UNIVERSAL');
    expect(composed).toContain('FAMILY');
    expect(composed).toContain('SURFACE');
    expect(composed).toContain('ACTION');
    expect(composed.indexOf('UNIVERSAL')).toBeLessThan(composed.indexOf('FAMILY'));
    expect(composed.indexOf('FAMILY')).toBeLessThan(composed.indexOf('SURFACE'));
    expect(composed.indexOf('SURFACE')).toBeLessThan(composed.indexOf('ACTION'));
  });

  it('throws if action rubric missing (a flow without rubric is a gap)', async () => {
    await expect(composeRubric('nonsense.surface.action')).rejects.toThrow(/rubric/i);
  });

  it('throws on malformed coverage id', async () => {
    await expect(composeRubric('only.two')).rejects.toThrow(/coverage/i);
  });
});
