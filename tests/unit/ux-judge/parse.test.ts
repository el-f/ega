import { describe, it, expect } from 'vitest';
import { parseJudgeVerdict } from '../../../scripts/ux-judge/judge/parse';

describe('parseJudgeVerdict', () => {
  it('parses fenced JSON', () => {
    const v = parseJudgeVerdict(
      '```json\n{"severity":"minor","findings":[],"suggestions":[]}\n```',
    );
    expect(v.severity).toBe('minor');
  });

  it('parses bare JSON', () => {
    const v = parseJudgeVerdict('{"severity":"ok","findings":[],"suggestions":[]}');
    expect(v.severity).toBe('ok');
  });

  it('parses fenced without language hint', () => {
    const v = parseJudgeVerdict('```\n{"severity":"blocker","findings":[],"suggestions":[]}\n```');
    expect(v.severity).toBe('blocker');
  });

  it('preserves findings and suggestions arrays', () => {
    const v = parseJudgeVerdict(
      '{"severity":"major","findings":[{"axis":"motion","where":"step 1","issue":"jank"}],"suggestions":["fix easing"]}',
    );
    expect(v.findings).toHaveLength(1);
    expect(v.suggestions).toEqual(['fix easing']);
  });

  it('throws on bad severity', () => {
    expect(() => parseJudgeVerdict('{"severity":"meh","findings":[],"suggestions":[]}')).toThrow(
      /severity/,
    );
  });

  it('throws on non-JSON', () => {
    expect(() => parseJudgeVerdict('hello world')).toThrow(/JSON/);
  });
});
