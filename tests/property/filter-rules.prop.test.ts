import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterRulesForRequest } from '@/shared/rules';
import type { Rule } from '@/shared/rules';
import { arbRule, arbTask } from './arbitraries';

describe('filterRulesForRequest', () => {
  it('result is a subset of the input rules', () => {
    fc.assert(
      fc.property(
        fc.array(arbRule, { maxLength: 20 }),
        arbTask,
        fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        (rules, task, host) => {
          const result = filterRulesForRequest(rules, task, host ?? undefined);
          const inputIds = new Set(rules.map((r) => r.id));
          for (const r of result) {
            expect(inputIds.has(r.id)).toBe(true);
          }
        },
      ),
    );
  });

  it('same input twice produces identical output (deterministic)', () => {
    fc.assert(
      fc.property(
        fc.array(arbRule, { maxLength: 20 }),
        arbTask,
        fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        (rules, task, host) => {
          const r1 = filterRulesForRequest(rules, task, host ?? undefined);
          const r2 = filterRulesForRequest(rules, task, host ?? undefined);
          expect(r1.map((r) => r.id)).toEqual(r2.map((r) => r.id));
        },
      ),
    );
  });

  it('filtering by a task that matches no rule scope → only rules with empty task scope pass', () => {
    fc.assert(
      fc.property(
        fc.array(arbRule, { maxLength: 15 }),
        fc.constantFrom(
          'translate',
          'explain',
          'summarize',
          'reword',
          'grammar',
          'suggest-replies',
        ),
        (rawRules, task) => {
          // Force all rules to scope to a different specific task so none match
          const mismatchTask = task === 'translate' ? 'explain' : 'translate';
          const narrowRules: Rule[] = rawRules.map((r) => ({
            ...r,
            enabled: true,
            scope: { tasks: [mismatchTask as typeof task], sites: undefined },
          }));
          const result = filterRulesForRequest(narrowRules, task, undefined);
          // None have empty task scope, none match task — result must be empty
          expect(result).toHaveLength(0);
        },
      ),
    );
  });

  it('disabled rules never appear in the result', () => {
    fc.assert(
      fc.property(fc.array(arbRule, { maxLength: 20 }), arbTask, (rules, task) => {
        const disabledRules = rules.map((r) => ({ ...r, enabled: false }));
        const result = filterRulesForRequest(disabledRules, task, undefined);
        expect(result).toHaveLength(0);
      }),
    );
  });

  it('result length never exceeds input length', () => {
    fc.assert(
      fc.property(
        fc.array(arbRule, { maxLength: 20 }),
        arbTask,
        fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        (rules, task, host) => {
          const result = filterRulesForRequest(rules, task, host ?? undefined);
          expect(result.length).toBeLessThanOrEqual(rules.length);
        },
      ),
    );
  });

  it('result is sorted ascending by specificity then addedAt (lexicographic) within each specificity tier', () => {
    // With no host the max specificity is 1 (tasks only); within a tier, addedAt must not decrease.
    fc.assert(
      fc.property(
        fc.array(arbRule, { minLength: 2, maxLength: 15 }),
        fc.constantFrom('translate', 'explain', 'summarize'),
        (rules, task) => {
          const result = filterRulesForRequest(rules, task, undefined);

          function specificity(r: Rule): number {
            let s = 0;
            if (r.scope.tasks.length > 0) s += 1;
            if (r.scope.sites && r.scope.sites.length > 0) s += 2;
            // host is undefined so the +4 branch never fires
            return s;
          }

          for (let i = 0; i < result.length - 1; i++) {
            const a = result[i];
            const b = result[i + 1];
            if (a === undefined || b === undefined) throw new Error('unreachable: loop bound');
            const sa = specificity(a);
            const sb = specificity(b);
            // Specificity must be non-decreasing
            expect(sa).toBeLessThanOrEqual(sb);
            // Within the same specificity tier addedAt must be non-decreasing
            if (sa === sb) {
              expect(a.addedAt.localeCompare(b.addedAt)).toBeLessThanOrEqual(0);
            }
          }
        },
      ),
    );
  });
});
