import { describe, it, expect } from 'vitest';
import { humanizeContext } from '@/shared/components/humanizeContext';

describe('humanizeContext', () => {
  it('returns empty array for empty context', () => {
    expect(humanizeContext({})).toEqual([]);
  });

  it('replaces newlines with ↵ and tabs with →', () => {
    const out = humanizeContext({
      beforeText: 'line1\n\tline2\n\t\tline3',
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.value).toBe('line1↵→line2↵→→line3');
    expect(out[0]?.truncated).toBe(false);
  });

  it('truncates values > 120 chars with ellipsis + truncated flag', () => {
    const long = 'a'.repeat(200);
    const out = humanizeContext({ beforeText: long });
    expect(out[0]?.value.length).toBeLessThanOrEqual(121);
    expect(out[0]?.value.endsWith('…')).toBe(true);
    expect(out[0]?.truncated).toBe(true);
  });

  it('labels fields with human names in stable order', () => {
    const out = humanizeContext({
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      beforeText: 'before',
      afterText: 'after',
    });
    const labels = out.map((e) => e.label);
    expect(labels).toEqual(['Page title', 'Page URL', 'Before', 'After']);
  });

  it('skips undefined / empty fields', () => {
    // exactOptionalPropertyTypes forbids an explicit undefined, so afterText is left out.
    const out = humanizeContext({
      pageTitle: 'x',
      beforeText: '',
    });
    expect(out.map((e) => e.label)).toEqual(['Page title']);
  });
});
