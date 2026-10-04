import { describe, expect, it } from 'vitest';
import { groupShots, sampleShots } from '../../../scripts/visual-judge/audit/grouping';
import type { Feature } from '../../../scripts/visual-judge/features';

const features: Feature[] = [
  {
    id: 'tooltip',
    label: 'Tooltip',
    surfaces: ['tooltip'],
    shotPrefixes: ['tooltip-'],
    codePaths: [],
    researchTopics: [],
  },
  {
    id: 'popup',
    label: 'Popup',
    surfaces: ['popup'],
    shotPrefixes: ['popup-', 'popup.'],
    codePaths: [],
    researchTopics: [],
  },
];

describe('groupShots', () => {
  it('matches by prefix', () => {
    const shots = ['tooltip-default.png', 'tooltip-loading.png', 'popup-default.png'];
    const groups = groupShots(shots, features);
    expect(groups[0]?.shots).toEqual(['tooltip-default.png', 'tooltip-loading.png']);
    expect(groups[1]?.shots).toEqual(['popup-default.png']);
  });

  it("matches exact filenames via 'foo.' prefix", () => {
    const groups = groupShots(['popup.png'], features);
    expect(groups[1]?.shots).toEqual(['popup.png']);
  });

  it('sorts shots inside the group deterministically', () => {
    const groups = groupShots(['tooltip-zzz.png', 'tooltip-aaa.png', 'tooltip-mmm.png'], features);
    expect(groups[0]?.shots).toEqual(['tooltip-aaa.png', 'tooltip-mmm.png', 'tooltip-zzz.png']);
  });
});

describe('sampleShots', () => {
  it('returns the full list when below cap', () => {
    expect(sampleShots(['a', 'b', 'c'], 5)).toEqual(['a', 'b', 'c']);
  });

  it('keeps first + last when sampling down', () => {
    const out = sampleShots(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3);
    expect(out[0]).toBe('a');
    expect(out[out.length - 1]).toBe('g');
    expect(out.length).toBe(3);
  });

  it('returns distinct entries (no duplicates from rounding)', () => {
    const out = sampleShots(['a', 'b'], 2);
    expect(new Set(out).size).toBe(out.length);
  });
});
