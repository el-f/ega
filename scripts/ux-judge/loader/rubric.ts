/** Concatenates the rubric layers from generic to specific. A flow with no per-action rubric is a gap, so that layer throws instead of falling back. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config';

async function readOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

export async function composeRubric(coverage: string): Promise<string> {
  const [family, surface, action] = coverage.split('.');
  if (!family || !surface || !action) {
    throw new Error(`bad coverage id: ${coverage}`);
  }
  const layers: ReadonlyArray<readonly [string, boolean]> = [
    [path.join(CONFIG.rubricRoot, '_base.md'), false],
    [path.join(CONFIG.rubricRoot, family, '_base.md'), false],
    [path.join(CONFIG.rubricRoot, family, surface, '_base.md'), false],
    [path.join(CONFIG.rubricRoot, family, surface, `${action}.md`), true],
  ];
  const parts: string[] = [];
  for (const [p, required] of layers) {
    const body = await readOrNull(p);
    if (body) parts.push(body);
    else if (required) throw new Error(`missing rubric for ${coverage}: expected ${p}`);
  }
  return parts.join('\n\n---\n\n');
}
