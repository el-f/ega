import { describe, it, expect } from 'vitest';
import { parseStoredSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

// An unknown task id fails the whole-field parse, and field repair then resets the map to default.
describe('preCleanForStorage — per-task map cleanup covers all four maps', () => {
  it('strips an unknown task id from taskMaxTokens, keeps the valid entries', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      taskMaxTokens: { summarize: 256, 'retired-task': 512 },
    } as Record<string, unknown>;
    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
    expect(out.taskMaxTokens?.summarize).toBe(256);
    expect((out.taskMaxTokens as Record<string, unknown>)['retired-task']).toBeUndefined();
  });

  it('strips an unknown task id from taskReasoningEfforts, keeps the valid entries', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      taskReasoningEfforts: { summarize: 'high', 'retired-task': 'low' },
    } as Record<string, unknown>;
    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
    expect(out.taskReasoningEfforts?.summarize).toBe('high');
    expect((out.taskReasoningEfforts as Record<string, unknown>)['retired-task']).toBeUndefined();
  });
});
