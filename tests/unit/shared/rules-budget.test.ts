import { describe, it, expect } from 'vitest';
import {
  clampRulesToBudget,
  estimateRulesBlockBytes,
  RULES_BLOCK_WARN_BYTES,
} from '@/shared/rules-budget';
import { filterRulesForRequest, type Rule } from '@/shared/rules';

function makeRule(body: string, idx: number): Rule {
  return {
    id: `rule-${idx.toString()}`,
    body,
    category: 'always',
    scope: { tasks: [] },
    source: 'manual',
    addedAt: new Date().toISOString(),
    enabled: true,
  };
}

describe('estimateRulesBlockBytes', () => {
  it('returns 0 for an empty rule list', () => {
    expect(estimateRulesBlockBytes([])).toBe(0);
  });

  it('returns a positive byte count for one rule', () => {
    const rules = [makeRule('Always be concise.', 0)];
    const size = estimateRulesBlockBytes(rules);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(RULES_BLOCK_WARN_BYTES);
  });

  it('exceeds RULES_BLOCK_WARN_BYTES when 100 rules of 500 chars are present', () => {
    const body = 'x'.repeat(490);
    const rules = Array.from({ length: 100 }, (_, i) => makeRule(body, i));
    const size = estimateRulesBlockBytes(rules);
    expect(size).toBeGreaterThan(RULES_BLOCK_WARN_BYTES);
  });

  it('filters by task — task-scoped rules excluded for different task', () => {
    const globalRule = makeRule('Always be polite.', 0);
    const translateRule: Rule = {
      ...makeRule('Translate literally.', 1),
      scope: { tasks: ['translate'] },
    };
    const summarizeSize = estimateRulesBlockBytes([globalRule, translateRule], 'summarize');
    const translateSize = estimateRulesBlockBytes([globalRule, translateRule], 'translate');
    expect(translateSize).toBeGreaterThan(summarizeSize);
  });
});

describe('clampRulesToBudget', () => {
  const body = 'x'.repeat(490);

  it('leaves a block that already fits untouched', () => {
    const rules = [makeRule('Always be concise.', 0)];
    expect(clampRulesToBudget(rules)).toBe(rules);
  });

  it('brings an over-budget block under the cap', () => {
    const rules = Array.from({ length: 100 }, (_, i) => makeRule(body, i));
    const kept = clampRulesToBudget(rules);
    expect(kept.length).toBeLessThan(rules.length);
    expect(estimateRulesBlockBytes(kept)).toBeLessThanOrEqual(RULES_BLOCK_WARN_BYTES);
  });

  it('drops the least specific rules first, in filterRulesForRequest order', () => {
    const global = Array.from({ length: 30 }, (_, i) => makeRule(body, i));
    const siteScoped: Rule = {
      ...makeRule(body, 99),
      scope: { tasks: ['translate'], sites: ['example.com'] },
    };
    const ordered = filterRulesForRequest([...global, siteScoped], 'translate', 'example.com');
    const kept = clampRulesToBudget(ordered);

    expect(kept.map((r) => r.id)).toContain('rule-99');
    expect(kept.map((r) => r.id)).not.toContain('rule-0');
  });
});
