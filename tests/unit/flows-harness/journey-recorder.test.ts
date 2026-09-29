/** Off by default; EGA_UX_RECORD=1 writes <coverage>.json under EGA_UX_RECORD_DIR (default tests/journeys/runs/). */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createJourneyRecorder } from '@tests/e2e/flows/_harness';

describe('createJourneyRecorder', () => {
  it('returns a no-op recorder when EGA_UX_RECORD is unset', async () => {
    delete process.env['EGA_UX_RECORD'];
    const rec = createJourneyRecorder('translation.tooltip.copy-button');
    rec.step('click', { selector: 'button' });
    await rec.finalize('passed');
    expect(rec.flushed).toBe(false);
  });

  it('writes a journey JSON sidecar when EGA_UX_RECORD=1', async () => {
    process.env['EGA_UX_RECORD'] = '1';
    const tmp = path.resolve('tmp-test-runs');
    process.env['EGA_UX_RECORD_DIR'] = tmp;
    try {
      const rec = createJourneyRecorder('translation.tooltip.copy-button');
      rec.step('mount');
      rec.step('click', { selector: 'button[data-act=copy]' });
      rec.latency('first-paint', 142);
      await rec.finalize('passed');
      const file = path.join(tmp, 'translation--tooltip--copy-button.json');
      const parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as {
        coverage: string;
        steps: ReadonlyArray<unknown>;
      };
      expect(parsed.coverage).toBe('translation.tooltip.copy-button');
      expect(parsed.steps).toHaveLength(2);
      expect(rec.flushed).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
      delete process.env['EGA_UX_RECORD'];
      delete process.env['EGA_UX_RECORD_DIR'];
    }
  });
});
