import { describe, it, expect, vi, afterEach } from 'vitest';
import { isMacLike } from '@/shared/utils/platform';

describe('platform util', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isMacLike returns true when userAgentData.platform reports macOS', () => {
    vi.stubGlobal('navigator', { userAgentData: { platform: 'macOS' } });
    expect(isMacLike()).toBe(true);
  });

  it('isMacLike returns true for iOS / iPadOS via userAgentData', () => {
    vi.stubGlobal('navigator', { userAgentData: { platform: 'iOS' } });
    expect(isMacLike()).toBe(true);
  });

  it('isMacLike returns false for Windows via userAgentData', () => {
    vi.stubGlobal('navigator', { userAgentData: { platform: 'Windows' } });
    expect(isMacLike()).toBe(false);
  });

  it('isMacLike falls back to navigator.platform when userAgentData is absent', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(isMacLike()).toBe(true);
  });

  it('isMacLike returns false on Win32 legacy platform', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(isMacLike()).toBe(false);
  });

  it('isMacLike returns false on Linux legacy platform', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
    expect(isMacLike()).toBe(false);
  });
});
