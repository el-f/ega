import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { getSettings, updateSettings } from '@/shared/storage';

describe('Privacy controls on About — round-trip persistence', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('captureResultMeta toggle persists off and on', async () => {
    let s = await getSettings();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s as any).captureResultMeta = false;
    await updateSettings(s);
    s = await getSettings();
    expect(s.captureResultMeta).toBe(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s as any).captureResultMeta = true;
    await updateSettings(s);
    s = await getSettings();
    expect(s.captureResultMeta).toBe(true);
  });

  it('chrome.storage.local.clear wipes settings; next getSettings returns defaults', async () => {
    await updateSettings({ captureResultMeta: false });
    await chromeMock.storage.local.clear();
    const s = await getSettings();
    // After clear, getSettings falls through to DEFAULT_SETTINGS.
    expect(s.captureResultMeta).toBe(true);
  });
});
