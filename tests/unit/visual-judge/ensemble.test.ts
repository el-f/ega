import { describe, expect, it } from 'vitest';
import { aggregateRolls } from '../../../scripts/visual-judge/judge/ensemble';
import type { FileVerdict } from '../../../scripts/visual-judge/judge/types';

type Roll = Omit<FileVerdict, 'file' | 'surface' | 'state'>;

function roll(overall: FileVerdict['overall'], extras: Partial<Roll> = {}): Roll {
  return { issues: [], overall, ...extras };
}

describe('aggregateRolls', () => {
  it('returns the single roll unchanged when N=1', () => {
    const only = roll('major-issues', { density: 'major' });
    expect(aggregateRolls([only])).toEqual(only);
  });

  it('returns unparseable for an empty roll list', () => {
    expect(aggregateRolls([]).overall).toBe('unparseable');
  });

  it('picks the majority overall across 3 rolls', () => {
    const out = aggregateRolls([roll('ok'), roll('ok'), roll('major-issues')]);
    expect(out.overall).toBe('ok');
  });

  it('promotes major when 2/3 rolls flag it', () => {
    const out = aggregateRolls([
      roll('major-issues', { density: 'major' }),
      roll('ok'),
      roll('major-issues', { contrast: 'major' }),
    ]);
    expect(out.overall).toBe('major-issues');
    // canonical roll carries the modal axis grade
    expect(out.density ?? out.contrast).toBeDefined();
  });

  it('returns inconclusive when rolls split with no majority', () => {
    const out = aggregateRolls([roll('ok'), roll('minor-issues'), roll('major-issues')]);
    expect(out.overall).toBe('inconclusive');
  });

  it('returns inconclusive on even-count tie', () => {
    const out = aggregateRolls([roll('ok'), roll('major-issues')]);
    expect(out.overall).toBe('inconclusive');
  });

  it('ignores cli-error rolls when at least one real roll exists', () => {
    const out = aggregateRolls([roll('cli-error'), roll('ok'), roll('ok')]);
    expect(out.overall).toBe('ok');
  });

  it('surfaces the first error roll when EVERY roll errored', () => {
    const out = aggregateRolls([roll('cli-error'), roll('unparseable')]);
    expect(out.overall).toBe('cli-error');
  });
});
