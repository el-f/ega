// Calls the real Anthropic API; runs only with EGA_LIVE_SMOKE=1 and ANTHROPIC_API_KEY set.
import { describe, it, expect } from 'vitest';
import { composeJudgePrompt } from '../../../scripts/ux-judge/judge/prompt';
import { composeRubric } from '../../../scripts/ux-judge/loader/rubric';
import { callJudge } from '../../../scripts/ux-judge/judge/call';
import type { JourneyRecord } from '../../../scripts/ux-judge/loader/journeys';

const itSkipNoKey =
  process.env['EGA_LIVE_SMOKE'] === '1' && process.env['ANTHROPIC_API_KEY'] ? it : it.skip;

describe('ux-judge smoke', () => {
  itSkipNoKey(
    'grades a hand-crafted journey end-to-end',
    async () => {
      const journey: JourneyRecord = {
        coverage: 'translation.tooltip.copy-button',
        steps: [
          { at: 0, kind: 'mount' },
          { at: 142, kind: 'click', selector: 'button[data-act=copy]' },
          { at: 318, kind: 'assert', expr: 'clipboard contains translation', passed: true },
        ],
        latencies: [
          { name: 'first-paint', ms: 142 },
          { name: 'copy', ms: 176 },
        ],
        outcome: 'passed',
      };
      const rubric = await composeRubric(journey.coverage);
      const prompt = composeJudgePrompt(rubric, journey);
      const verdict = await callJudge(prompt, 'diff');
      expect(['ok', 'minor', 'major', 'blocker']).toContain(verdict.severity);
    },
    30_000,
  );
});
