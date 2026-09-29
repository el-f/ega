import { describe, it, expect } from 'vitest';
import { coverageIdsFromFlowFile } from '../../../scripts/ux-judge/loader/changed-flows';

describe('coverageIdsFromFlowFile', () => {
  it('derives family.surface.action from a 3-segment path', () => {
    expect(coverageIdsFromFlowFile('translation/tooltip/copy-button.flow.spec.ts')).toEqual([
      'translation.tooltip.copy-button',
    ]);
  });

  it('joins deeper paths into the action segment', () => {
    expect(coverageIdsFromFlowFile('translation/sidepanel/stream/tokens.flow.spec.ts')).toEqual([
      'translation.sidepanel.stream-tokens',
    ]);
  });

  it('returns empty for too-shallow paths', () => {
    expect(coverageIdsFromFlowFile('orphan.flow.spec.ts')).toEqual([]);
    expect(coverageIdsFromFlowFile('family/only.flow.spec.ts')).toEqual([]);
  });
});
