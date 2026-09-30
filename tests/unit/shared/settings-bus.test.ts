import { describe, it, expect, vi, beforeEach } from 'vitest';
import { patchSettings } from '@/shared/settings-bus';
import { chromeMock } from '../../mocks/chrome';
import type { Settings } from '@/shared/types';

describe('patchSettings', () => {
  beforeEach(() => {
    chromeMock.runtime.sendMessage = vi
      .fn()
      .mockResolvedValue({ ok: true, settings: { theme: 'dark' } });
  });

  it('sends settings:update envelope and resolves with merged settings', async () => {
    const ack = await patchSettings({ theme: 'dark' });
    expect(ack.ok).toBe(true);
    expect(ack.settings).toEqual({ theme: 'dark' });
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'settings:update',
      patch: { theme: 'dark' },
    });
  });

  it('propagates quota reason from SW ack', async () => {
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: false, reason: 'quota' });
    const ack = await patchSettings({ theme: 'light' });
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('quota');
  });

  it('propagates schema reason from SW ack', async () => {
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: false, reason: 'schema' });
    const ack = await patchSettings({ theme: 'oops' as unknown as Settings['theme'] });
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('schema');
  });

  it('falls back to unknown when sendMessage rejects', async () => {
    chromeMock.runtime.sendMessage = vi.fn().mockRejectedValue(new Error('SW asleep'));
    const ack = await patchSettings({ theme: 'dark' });
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('unknown');
  });

  it('falls back to unknown on malformed (non-object) ack', async () => {
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue(null);
    const ack = await patchSettings({ theme: 'dark' });
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('unknown');
  });
});
