import { describe, expect, it } from 'vitest';
import { answerAgainLabel, refinePresets } from '@/shared/refine-presets';

describe('task-specific reply refinements', () => {
  it('keeps a custom task’s instructions free of built-in refinement assumptions', () => {
    expect(refinePresets('custom-summary')).toEqual([]);
    expect(answerAgainLabel('custom-summary', 'My outline')).toBe('My outline instead');
  });
  it('offers correction notes for Grammar without a translation or style change', () => {
    const presets = refinePresets('grammar');
    expect(presets).toEqual([
      {
        id: 'explain-changes',
        label: 'Explain changes',
        body: 'After the corrected text, list each change in one short line.',
      },
    ]);
    expect(answerAgainLabel('grammar', 'Grammar')).toBe('Fix grammar instead');
  });
  it('uses the same persistent instruction for a shorter Translate or Explain reply', () => {
    const translate = refinePresets('translate').find((p) => p.id === 'shorter');
    const explain = refinePresets('explain').find((p) => p.id === 'shorter');
    expect(translate?.body).toBe('Make outputs shorter.');
    expect(explain?.body).toBe(translate?.body);
  });
});
