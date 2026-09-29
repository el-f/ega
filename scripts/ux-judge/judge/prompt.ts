// Two cached system blocks: the header hits on every call, the rubric on every roll of the same action.
import type { JourneyRecord } from '../loader/journeys';

export interface CacheControl {
  type: 'ephemeral';
}

export interface JudgeSystemBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}

export interface JudgePrompt {
  system: ReadonlyArray<JudgeSystemBlock>;
  user: string;
}

const SYSTEM_INSTRUCTION =
  'You are a UX judge. Grade the journey strictly against the rubric below. ' +
  'Reply with a single JSON object: { severity: "ok"|"minor"|"major"|"blocker", ' +
  'findings: [{axis, where, issue}], suggestions: [string] }. No prose, no markdown.';

export function composeJudgePrompt(rubric: string, journey: JourneyRecord): JudgePrompt {
  return {
    system: [
      { type: 'text', text: SYSTEM_INSTRUCTION, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: rubric, cache_control: { type: 'ephemeral' } },
    ],
    user: JSON.stringify({
      coverage: journey.coverage,
      steps: journey.steps,
      latencies: journey.latencies,
      outcome: journey.outcome,
    }),
  };
}
