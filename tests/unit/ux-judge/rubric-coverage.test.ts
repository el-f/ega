/** Every action in tests/e2e/flows/coverage.ts must have a rubric reachable from composeRubric. */
import { describe, it, expect } from 'vitest';
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
});
