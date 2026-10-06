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
    expect(push.mock.calls[0]?.[0].variant).toBe('danger');
    expect(push.mock.calls[0]?.[0].message).toMatch(/full/i);
    expect(push.mock.calls[0]?.[0].message).toMatch(/delete old conversations/i);
    // Trying again cannot free storage, so the toast offers no retry.
    expect(push.mock.calls[0]?.[0].action).toBeUndefined();
  });

  // A non-quota failure loses the setting just as silently, so it gets the same treatment.
  it('reports a non-quota failure too', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    vi.spyOn(storage, 'updateSettings').mockRejectedValueOnce(new Error('disk i/o failed'));
    await expect(saveSettings({ theme: 'dark' })).resolves.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0].message).toBe('Not saved. Chrome did not take the change.');
    expect(push.mock.calls[0]?.[0].message).not.toContain('disk i/o');
  });

  it('Try again runs the same write once more', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const write = vi
      .spyOn(storage, 'updateSettings')
      .mockRejectedValueOnce(new Error('disk i/o failed'))
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof storage.updateSettings>>);
    await saveSettings({ theme: 'dark' });
    const action = push.mock.calls[0]?.[0].action;
    expect(action?.label).toBe('Try again');
    action?.onClick();
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write).toHaveBeenLastCalledWith({ theme: 'dark' });
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
