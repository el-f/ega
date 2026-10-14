import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { physicalProps, SHEETS } from '../../../scripts/logical-props-lint';

describe('logical-props lint', () => {
  it('flags every physical side property, and leaves logical ones alone', () => {
    const css = [
      '.a {',
      '  margin-left: 4px;',
      '  padding-right: 2px;',
      '  border-left: 1px solid;',
      '  right: 0;',
      '  text-align: left;',
      '  margin-inline-start: 4px;',
      '  inset-inline-end: 0;',
      '  text-align: start;',
      '}',
    ].join('\n');
    expect(physicalProps(css).map((f) => f.line)).toEqual([2, 3, 4, 5, 6]);
  });

  it('allows a marked line, and a left: 50% that a -50% translate centers', () => {
    const css = [
      '.bar {',
      '  left: 50%;',
      '  transform: translateX(-50%);',
      '}',
      '.label {',
      '  left: 50%;',
      '  translate: -50% 0;',
      '}',
      '.mirror {',
      '  /* logical-props-allow: mirrors a component */',
      '  padding-left: 2px;',
      '  border-left: 1px solid; /* logical-props-allow */',
      '}',
      '.stray {',
      '  left: 50%;',
      '}',
    ].join('\n');
    expect(physicalProps(css).map((f) => f.line)).toEqual([15]);
  });

  it('passes on every in-page sheet', () => {
    for (const sheet of SHEETS)
      expect(physicalProps(readFileSync(sheet, 'utf8')), sheet).toEqual([]);
  });
});
