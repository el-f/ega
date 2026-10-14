import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { coverageIdsFromFlowFile } from '../../../scripts/ux-judge/loader/changed-flows';

describe('coverageIdsFromFlowFile', () => {
  it('reads the id from the marker of a two-level spec', () => {
    expect(coverageIdsFromFlowFile('tooltip/cancel-loading.flow.spec.ts')).toEqual([
      'translation.tooltip.cancel-loading',
    ]);
  });

  it('reads the id from the marker of a three-level spec', () => {
    expect(
      coverageIdsFromFlowFile(
        'integration/popup-sidepanel-handoff/clipboard-tile-handoff-payload.flow.spec.ts',
      ),
    ).toEqual(['integration.popup-sidepanel-handoff.clipboard-tile-handoff-payload']);
  });

  it('returns empty for a spec the diff deleted or one with no marker', () => {
    expect(coverageIdsFromFlowFile('gone/deleted.flow.spec.ts')).toEqual([]);
    const root = mkdtempSync(path.join(tmpdir(), 'ega-flows-'));
    writeFileSync(
      path.join(root, 'bare.flow.spec.ts'),
      "import { test } from '@playwright/test';\n",
    );
    expect(coverageIdsFromFlowFile('bare.flow.spec.ts', root)).toEqual([]);
  });
});
