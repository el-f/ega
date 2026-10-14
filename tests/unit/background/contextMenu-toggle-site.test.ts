import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import { computeSiteMenuTitle, handleSiteToggleClick } from '@/background/contextMenu';
import type { Settings } from '@/shared/types';
import { sel } from '@tests/_helpers/lang';

type SitePrefs = Settings['sitePrefs'];

/** A replaceSitePrefs stub that applies the transform to a seeded map, the way the real one does under the lock. */
function replacer(seed: SitePrefs): {
  replace: Mock<(transform: (cur: SitePrefs) => SitePrefs) => Promise<void>>;
  result: () => SitePrefs | null;
} {
  let written: SitePrefs | null = null;
  const replace = vi.fn(async (transform: (cur: SitePrefs) => SitePrefs) => {
    written = transform(seed);
  });
  return { replace, result: () => written };
}

describe('site-toggle context-menu', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetChromeMock();
  });

  it('computeSiteMenuTitle flips label based on disabled state', () => {
    expect(computeSiteMenuTitle(false)).toBe('Disable Ega on this site');
    expect(computeSiteMenuTitle(true)).toBe('Enable Ega on this site');
  });

  it('handleSiteToggleClick flips sitePrefs[origin].disabled inside one transform', async () => {
    const { replace, result } = replacer({ 'https://example.com': { disabled: false } });
    await handleSiteToggleClick({ url: 'https://example.com/path', replaceSitePrefs: replace });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(result()).toEqual({ 'https://example.com': { disabled: true } });
  });

  it('handleSiteToggleClick removes the origin when toggling back to defaults', async () => {
    const { replace, result } = replacer({ 'https://example.com': { disabled: true } });
    await handleSiteToggleClick({ url: 'https://example.com/', replaceSitePrefs: replace });
    // A merge would resurrect the deleted origin on the next read; the transform hands back the whole map.
    expect(result()).toEqual({});
  });

  it('handleSiteToggleClick keeps other origins intact when deleting', async () => {
    const { replace, result } = replacer({
      'https://example.com': { disabled: true },
      'https://other.com': { disabled: false, defaultLang: sel('es') },
    });
    await handleSiteToggleClick({ url: 'https://example.com/', replaceSitePrefs: replace });
    expect(result()).toEqual({ 'https://other.com': { disabled: false, defaultLang: 'es' } });
  });

  it('handleSiteToggleClick reads the map the transform is given, not a snapshot taken earlier', async () => {
    // A memo-direction write landed between the click and the lock: the transform must see it.
    const { replace, result } = replacer({
      'https://example.com': {
        disabled: false,
        lastDirection: { source: sel('es'), target: sel('en') },
      },
    });
    await handleSiteToggleClick({ url: 'https://example.com/', replaceSitePrefs: replace });
    expect(result()).toEqual({
      'https://example.com': {
        disabled: true,
        lastDirection: { source: 'es', target: 'en' },
      },
    });
  });

  it('handleSiteToggleClick is a no-op for chrome:// URLs', async () => {
    const { replace } = replacer({});
    await handleSiteToggleClick({ url: 'chrome://newtab/', replaceSitePrefs: replace });
    expect(replace).not.toHaveBeenCalled();
  });
});
