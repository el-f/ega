import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveSettings } from '@/options/storage-with-toast';
import * as storage from '@/shared/storage';
import { toastStore } from '@/shared/components/toastStore';

describe('saveSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('names the cap and a control that exists when the write hits quota', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    vi.spyOn(storage, 'updateSettings').mockRejectedValueOnce(
      new Error('QUOTA_BYTES quota exceeded'),
    );
    await expect(saveSettings({ theme: 'dark' })).resolves.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0].variant).toBe('warning');
    expect(push.mock.calls[0]?.[0].message).toMatch(/full/i);
    expect(push.mock.calls[0]?.[0].message).toMatch(/new conversation/i);
  });

  // A non-quota failure loses the setting just as silently, so it gets the same treatment.
  it('reports a non-quota failure too', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    vi.spyOn(storage, 'updateSettings').mockRejectedValueOnce(new Error('disk i/o failed'));
    await expect(saveSettings({ theme: 'dark' })).resolves.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0].message).toMatch(/not saved/i);
  });

  it('never rejects, so a fire-and-forget call cannot raise an unhandled rejection', async () => {
    vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    vi.spyOn(storage, 'updateSettings').mockRejectedValueOnce(new Error('boom'));
    await expect(saveSettings({ theme: 'dark' })).resolves.toBeNull();
  });

  it('returns the merged settings on success', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const merged = { theme: 'dark' } as unknown as Awaited<
      ReturnType<typeof storage.updateSettings>
    >;
    vi.spyOn(storage, 'updateSettings').mockResolvedValueOnce(merged);
    await expect(saveSettings({ theme: 'dark' })).resolves.toEqual({ theme: 'dark' });
    expect(push).not.toHaveBeenCalled();
  });
});
