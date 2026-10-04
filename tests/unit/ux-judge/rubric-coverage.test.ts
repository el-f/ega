/** Every action in tests/e2e/flows/coverage.ts must have a rubric reachable from composeRubric. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../../scripts/ux-judge/config';
import { composeRubric } from '../../../scripts/ux-judge/loader/rubric';
import { COVERAGE } from '../../../tests/e2e/flows/coverage';

describe('composeRubric coverage matrix', () => {
  for (const family of COVERAGE) {
    for (const surface of family.surfaces) {
      for (const action of surface.actions) {
        const id = `${family.id}.${surface.id}.${action.id}`;
        it(`composes ${id}`, async () => {
          const composed = await composeRubric(id);
          expect(composed.length).toBeGreaterThan(0);
          // Each layer separated by the horizontal rule.
          expect(composed).toContain('---');
        });
      }
    }
  }

  it('every action rubric names a coverage id', () => {
    const ids = new Set(
      COVERAGE.flatMap((f) =>
        f.surfaces.flatMap((s) => s.actions.map((a) => `${f.id}.${s.id}.${a.id}`)),
      ),
    );
    const orphans = fs
      .readdirSync(CONFIG.rubricRoot, { recursive: true, encoding: 'utf8' })
      .filter((p) => p.endsWith('.md') && path.basename(p) !== '_base.md')
      .map((p) => p.slice(0, -'.md'.length).split(path.sep).join('.'))
      .filter((id) => !ids.has(id));
    expect(orphans).toEqual([]);
  });
});
