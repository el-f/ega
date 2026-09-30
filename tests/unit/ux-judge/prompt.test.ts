import { describe, it, expect } from 'vitest';
import { composeJudgePrompt } from '../../../scripts/ux-judge/judge/prompt';
import type { JourneyRecord } from '../../../scripts/ux-judge/loader/journeys';

const journey: JourneyRecord = {
  coverage: 'translation.tooltip.copy-button',
  steps: [{ at: 0, kind: 'mount' }],
  latencies: [{ name: 'first-paint', ms: 142 }],
  outcome: 'passed',
};

describe('composeJudgePrompt', () => {
  it('produces two ephemeral-cached system blocks', () => {
    const p = composeJudgePrompt('RUBRIC_BODY', journey);
    expect(p.system).toHaveLength(2);
    expect(p.system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.system[1]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.system[1]?.text).toBe('RUBRIC_BODY');
  });

  it('serializes the journey into the user turn', () => {
    const p = composeJudgePrompt('R', journey);
    expect(typeof p.user).toBe('string');
    const u = JSON.parse(p.user as string) as JourneyRecord;
    expect(u.coverage).toBe(journey.coverage);
    expect(u.outcome).toBe('passed');
    expect(u.steps).toHaveLength(1);
  });
});
