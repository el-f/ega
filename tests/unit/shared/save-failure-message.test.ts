import { describe, it, expect } from 'vitest';
import { QUOTA_MESSAGE, SCHEMA_MESSAGE, settingsSaveFailedMessage } from '@/shared/constants';
import type { PatchAck } from '@/shared/settings-bus';

describe('settingsSaveFailedMessage — one copy for every surface that reports a failed write', () => {
  it('names the storage-full case and how to free space', () => {
    expect(settingsSaveFailedMessage('quota')).toBe(QUOTA_MESSAGE);
    expect(QUOTA_MESSAGE).toMatch(/side panel/i);
  });

  it('names the rejected-value case and how to recover', () => {
    expect(settingsSaveFailedMessage('schema')).toBe(SCHEMA_MESSAGE);
    expect(SCHEMA_MESSAGE).not.toBe(QUOTA_MESSAGE);
  });

  it('falls back to a plain sentence for an unclassified failure', () => {
    const fallback = settingsSaveFailedMessage('unknown');
    expect(fallback.length).toBeGreaterThan(0);
    expect(settingsSaveFailedMessage(undefined)).toBe(fallback);
  });

  it('never returns an empty string for any reason the bus can send', () => {
    for (const reason of ['quota', 'schema', 'unknown', undefined] satisfies PatchAck['reason'][]) {
      expect(settingsSaveFailedMessage(reason).length).toBeGreaterThan(0);
    }
  });

  it('tells the user the change did not land, whatever the reason', () => {
    for (const reason of ['quota', 'schema', 'unknown', undefined] satisfies PatchAck['reason'][]) {
      expect(settingsSaveFailedMessage(reason)).toMatch(/not saved/i);
    }
  });
});
