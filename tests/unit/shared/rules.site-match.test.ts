import { describe, it, expect } from 'vitest';
import { filterRulesForRequest, normaliseSiteEntry, siteMatches } from '@/shared/rules';
import type { Rule } from '@/shared/rules';
import { slotsForTask } from '@/shared/slot-registry';

function rule(sites: string[] | undefined, id = 'r'): Rule {
  return {
    id,
    body: 'keep names',
    category: 'always',
    scope: sites ? { tasks: [], sites } : { tasks: [] },
    source: 'manual',
    addedAt: '2026-09-05T00:00:00.000Z',
    enabled: true,
  };
}

describe('siteMatches', () => {
  it('matches the host and every subdomain of it', () => {
    expect(siteMatches('example.com', 'example.com')).toBe(true);
    expect(siteMatches('example.com', 'www.example.com')).toBe(true);
    expect(siteMatches('example.com', 'a.b.example.com')).toBe(true);
    expect(siteMatches('Example.com', 'EXAMPLE.com')).toBe(true);
  });

  it('does not match a host that merely ends with the letters', () => {
    expect(siteMatches('example.com', 'notexample.com')).toBe(false);
    expect(siteMatches('www.example.com', 'example.com')).toBe(false);
  });
});

describe('normaliseSiteEntry', () => {
  it('stores the host of whatever the user typed', () => {
    expect(normaliseSiteEntry('https://www.Example.com/path?q=1')).toBe('example.com');
    expect(normaliseSiteEntry('  news.example.com ')).toBe('news.example.com');
    expect(normaliseSiteEntry('example.com:8080')).toBe('example.com');
    expect(normaliseSiteEntry('')).toBe('');
  });
});

describe('filterRulesForRequest with a site scope', () => {
  it('applies a rule for example.com on www.example.com', () => {
    expect(
      filterRulesForRequest([rule(['example.com'])], 'translate', 'www.example.com'),
    ).toHaveLength(1);
  });

  it('skips a site-scoped rule when the host is unknown', () => {
    expect(filterRulesForRequest([rule(['example.com'])], 'translate', undefined)).toHaveLength(0);
  });

  it('ranks the site-matched rule after the global one', () => {
    const out = filterRulesForRequest(
      [rule(['example.com'], 'site'), rule(undefined, 'global')],
      'translate',
      'app.example.com',
    );
    expect(out.map((r) => r.id)).toEqual(['global', 'site']);
  });
});

describe('slot registry follows buildPrompt', () => {
  it('lists the preset and context slots for every task, not only translate and explain', () => {
    const names = slotsForTask('summarize').map((s) => s.name);
    for (const n of ['langLabel', 'langHint', 'targetLangHint', 'examples', 'context']) {
      expect(names, n).toContain(n);
    }
  });
});
