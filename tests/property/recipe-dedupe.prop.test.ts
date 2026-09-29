import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { arbRule, arbRecipe } from './setup';
import type { Rule } from '@/shared/rules';
import type { Recipe } from '@/shared/recipes';
import { uuid } from '@/shared/uuid';

// Copies of the private helpers in src/options/templates-handlers.ts — keep both in sync.
function recipeRulesToRules(recipe: Recipe): Rule[] {
  return (recipe.rules ?? []).map((r) => ({
    id: uuid(),
    body: r.body,
    category: r.category,
    scope:
      r.scopeSites && r.scopeSites.length > 0
        ? { tasks: [recipe.task], sites: [...r.scopeSites] }
        : { tasks: [recipe.task] },
    source: 'recipe' as const,
    recipeId: recipe.id,
    addedAt: new Date().toISOString(),
    enabled: true,
  }));
}

function filterDupeRecipeRules(candidates: Rule[], priorRules: readonly Rule[]): Rule[] {
  const existing = new Set(
    priorRules
      .filter((r) => r.source === 'recipe' && r.recipeId !== undefined)
      .map((r) => `${r.recipeId}${r.category}${r.body.trim()}`),
  );
  return candidates.filter((c) => !existing.has(`${c.recipeId}${c.category}${c.body.trim()}`));
}

describe('recipeRulesToRules', () => {
  it('every output rule has source === recipe', () => {
    fc.assert(
      fc.property(arbRecipe, (recipe) => {
        const rules = recipeRulesToRules(recipe);
        for (const r of rules) {
          expect(r.source).toBe('recipe');
        }
      }),
    );
  });

  it('output length equals recipe.rules length (or 0 when absent)', () => {
    fc.assert(
      fc.property(arbRecipe, (recipe) => {
        const rules = recipeRulesToRules(recipe);
        expect(rules.length).toBe((recipe.rules ?? []).length);
      }),
    );
  });

  it('every output rule has recipeId === recipe.id', () => {
    fc.assert(
      fc.property(arbRecipe, (recipe) => {
        const rules = recipeRulesToRules(recipe);
        for (const r of rules) {
          expect(r.recipeId).toBe(recipe.id);
        }
      }),
    );
  });

  it('scope.tasks always contains exactly [recipe.task] for every output rule', () => {
    fc.assert(
      fc.property(arbRecipe, (recipe) => {
        const rules = recipeRulesToRules(recipe);
        for (const r of rules) {
          expect(r.scope.tasks).toEqual([recipe.task]);
        }
      }),
    );
  });

  it('scope.sites is set iff the source RecipeRule had non-empty scopeSites', () => {
    fc.assert(
      fc.property(arbRecipe, (recipe) => {
        const srcRules = recipe.rules ?? [];
        const outRules = recipeRulesToRules(recipe);
        expect(outRules.length).toBe(srcRules.length);
        for (let i = 0; i < srcRules.length; i++) {
          const src = srcRules[i];
          const out = outRules[i];
          if (src === undefined || out === undefined) throw new Error('unreachable: loop bound');
          if (src.scopeSites && src.scopeSites.length > 0) {
            expect(out.scope.sites).toEqual([...src.scopeSites]);
          } else {
            expect(out.scope.sites).toBeUndefined();
          }
        }
      }),
    );
  });

  it('every output rule is enabled and body/category match the source RecipeRule', () => {
    fc.assert(
      fc.property(arbRecipe, (recipe) => {
        const srcRules = recipe.rules ?? [];
        const outRules = recipeRulesToRules(recipe);
        for (let i = 0; i < srcRules.length; i++) {
          const src = srcRules[i];
          const out = outRules[i];
          if (src === undefined || out === undefined) throw new Error('unreachable: loop bound');
          expect(out.enabled).toBe(true);
          expect(out.body).toBe(src.body);
          expect(out.category).toBe(src.category);
        }
      }),
    );
  });
});

describe('filterDupeRecipeRules', () => {
  it('filterDupeRecipeRules([], prior) === []', () => {
    fc.assert(
      fc.property(fc.array(arbRule, { maxLength: 20 }), (prior) => {
        const result = filterDupeRecipeRules([], prior);
        expect(result).toHaveLength(0);
      }),
    );
  });

  it('filterDupeRecipeRules(R, []) returns all R (no prior → nothing to dedupe)', () => {
    fc.assert(
      fc.property(fc.array(arbRule, { maxLength: 10 }), (rules) => {
        const recipeRules = rules.map((r) => ({
          ...r,
          source: 'recipe' as const,
          recipeId: r.recipeId ?? 'test-recipe',
        }));
        const result = filterDupeRecipeRules(recipeRules, []);
        expect(result.map((r) => r.id)).toEqual(recipeRules.map((r) => r.id));
      }),
    );
  });

  it('filterDupe is idempotent — applying twice equals applying once', () => {
    fc.assert(
      fc.property(
        fc.array(arbRule, { maxLength: 15 }),
        fc.array(arbRule, { maxLength: 10 }),
        (candidates, prior) => {
          const recipeCandiates = candidates.map((r) => ({
            ...r,
            source: 'recipe' as const,
            recipeId: r.recipeId ?? 'test-recipe',
          }));
          const once = filterDupeRecipeRules(recipeCandiates, prior);
          const twice = filterDupeRecipeRules(once, prior);
          expect(twice.map((r) => r.id)).toEqual(once.map((r) => r.id));
        },
      ),
    );
  });

  it('filterDupe of R against (prior ++ R) returns [] — re-applying same recipe produces zero new rules', () => {
    fc.assert(
      fc.property(arbRecipe, (recipe) => {
        const rules = recipeRulesToRules(recipe);
        if (rules.length === 0) return;
        const result = filterDupeRecipeRules(rules, rules);
        expect(result).toHaveLength(0);
      }),
    );
  });

  it('result is a subset of the candidates', () => {
    fc.assert(
      fc.property(
        fc.array(arbRule, { maxLength: 15 }),
        fc.array(arbRule, { maxLength: 10 }),
        (candidates, prior) => {
          const result = filterDupeRecipeRules(candidates, prior);
          const candidateIds = new Set(candidates.map((r) => r.id));
          for (const r of result) {
            expect(candidateIds.has(r.id)).toBe(true);
          }
        },
      ),
    );
  });

  it('non-recipe priors are ignored — dedup key only applies to source===recipe prior rules', () => {
    fc.assert(
      fc.property(arbRecipe, (recipe) => {
        const rules = recipeRulesToRules(recipe);
        if (rules.length === 0) return;
        const manualPriors: Rule[] = rules.map((r) => ({
          ...r,
          source: 'manual' as const,
        }));
        const result = filterDupeRecipeRules(rules, manualPriors);
        expect(result.map((r) => r.id)).toEqual(rules.map((r) => r.id));
      }),
    );
  });

  it('dedup key is (recipeId, category, body.trim()) — whitespace-only body diff does not bypass dedup', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
        fc.constantFrom('always', 'never', 'prefer', 'format', 'unknown'),
        fc.string({ minLength: 1, maxLength: 30 }),
        (body, category, recipeId) => {
          const prior: Rule = {
            id: 'prior-1',
            body: `  ${body}  `,
            category: category as Rule['category'],
            scope: { tasks: [] },
            source: 'recipe',
            recipeId,
            addedAt: '2024-01-01T00:00:00.000Z',
            enabled: true,
          };
          const candidate: Rule = {
            id: 'cand-1',
            body: body.trim(),
            category: category as Rule['category'],
            scope: { tasks: [] },
            source: 'recipe',
            recipeId,
            addedAt: '2024-01-01T00:00:00.000Z',
            enabled: true,
          };
          const result = filterDupeRecipeRules([candidate], [prior]);
          expect(result).toHaveLength(0);
        },
      ),
    );
  });
});
