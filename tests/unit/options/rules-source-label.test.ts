import { describe, it, expect } from 'vitest';
import { sourceLabel, sourceVariant } from '@/options/components/rules-source-label';
import type { Rule } from '@/shared/rules';

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: overrides.id ?? 'r1',
    body: overrides.body ?? 'Always preserve URLs verbatim.',
    category: overrides.category ?? 'always',
    scope: overrides.scope ?? { tasks: [] },
    source: overrides.source ?? 'manual',
    addedAt: overrides.addedAt ?? '2026-05-09T00:00:00.000Z',
    enabled: overrides.enabled ?? true,
    ...(overrides.recipeId !== undefined ? { recipeId: overrides.recipeId } : {}),
  };
}

describe('rules-source-label (shared helper)', () => {
  it('labels each source consistently', () => {
    expect(sourceLabel(rule({ source: 'recipe', recipeId: 'formal' }))).toBe('formal');
    expect(sourceLabel(rule({ source: 'recipe' }))).toBe('recipe');
    expect(sourceLabel(rule({ source: 'describe' }))).toBe('AI');
    expect(sourceLabel(rule({ source: 'manual' }))).toBe('manual');
  });

  it('maps each source to a stable badge variant', () => {
    expect(sourceVariant(rule({ source: 'recipe' }))).toBe('success');
    expect(sourceVariant(rule({ source: 'describe' }))).toBe('default');
    expect(sourceVariant(rule({ source: 'manual' }))).toBe('muted');
  });

  it('returns a non-null label for every source so both list views render the same badge', () => {
    const sources: Rule['source'][] = ['recipe', 'describe', 'manual'];
    for (const source of sources) {
      const r = rule({ source });
      expect(sourceLabel(r)).toBeTruthy();
    }
  });
});
