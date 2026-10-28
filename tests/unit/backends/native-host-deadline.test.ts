import { describe, expect, it } from 'vitest';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../../../native-host/lib/cli-session.mjs';
import { settingsSchema } from '@/shared/settings-schema';
import { TIMEOUT_GRACE_MS } from '@/shared/stuck-timeout';

function maxOf(key: 'translateTimeoutMs' | 'imageTranslateTimeoutMs'): number {
  const step = settingsSchema.entries[key].wrapped.pipe.find((a) => a.type === 'max_value');
  const max = step && 'requirement' in step ? step.requirement : undefined;
  if (typeof max !== 'number') throw new Error(`settingsSchema.${key} has no max_value`);
  return max;
}

describe('native host CLI deadline', () => {
  it('outlasts the longest text or image timeout a user can set, so the extension decides', () => {
    const longest = Math.max(maxOf('translateTimeoutMs'), maxOf('imageTranslateTimeoutMs'));
    expect(longest).toBe(300_000);
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(longest + TIMEOUT_GRACE_MS);
  });
});
