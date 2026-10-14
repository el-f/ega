import { describe, it, expect, beforeEach } from 'vitest';
import { handleSiteToggleClick } from '@/background/contextMenu';
import { getSettings, replaceSitePrefs } from '@/shared/storage';
import { resolveEffective } from '@/shared/site-profile';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import type { Settings } from '@/shared/types';

/** Real writer, real storage, real reader — a hand-seeded `sitePrefs` proves nothing about the key shape. */
function toggle(url: string): Promise<void> {
  return handleSiteToggleClick({ url, replaceSitePrefs });
}

async function seedRawSitePrefs(sitePrefs: Record<string, unknown>): Promise<void> {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, sitePrefs },
  });
}

beforeEach(() => {
  resetChromeMock();
});

describe('site toggle → content-script read', () => {
  it('a toggled-off site reads back as disabled at the key the content script uses', async () => {
    await toggle('https://example.com/some/path?q=1');

    const s = await getSettings();
    expect(resolveEffective(s, 'https://example.com').disabled).toBe(true);
  });

  it('toggling twice removes the entry entirely', async () => {
    await toggle('https://example.com/');
    await toggle('https://example.com/');

    const s = await getSettings();
    expect(s.sitePrefs).toEqual({});
    expect(resolveEffective(s, 'https://example.com').disabled).toBe(false);
  });

  it('a non-default port is part of the key, so the bare host stays enabled', async () => {
    await toggle('https://example.com:8443/');

    const s = await getSettings();
    expect(resolveEffective(s, 'https://example.com:8443').disabled).toBe(true);
    expect(resolveEffective(s, 'https://example.com').disabled).toBe(false);
  });

  it('http and https on the same host are separate sites', async () => {
    await toggle('http://example.com/');

    const s = await getSettings();
    expect(resolveEffective(s, 'http://example.com').disabled).toBe(true);
    expect(resolveEffective(s, 'https://example.com').disabled).toBe(false);
  });

  it('the menu label read agrees with what the toggle wrote', async () => {
    await toggle('https://example.com/');

    const s = await getSettings();
    // What updateSiteToggleTitle asks storage: same key shape, same answer.
    expect(s.sitePrefs['https://example.com']?.disabled).toBe(true);
  });
});

describe('sitePrefs bare-host repair', () => {
  // The old writer stored `URL.host`, so the scheme is unrecoverable — repair into both rather than guess https.
  it('rewrites a legacy bare-host key to both origins for that host', async () => {
    await seedRawSitePrefs({ 'example.com': { disabled: true } });

    const s = await getSettings();
    expect(Object.keys(s.sitePrefs).sort()).toEqual(['http://example.com', 'https://example.com']);
    expect(resolveEffective(s, 'https://example.com').disabled).toBe(true);
    expect(resolveEffective(s, 'http://example.com').disabled).toBe(true);
  });

  it('keeps the port when repairing', async () => {
    await seedRawSitePrefs({ 'example.com:8443': { disabled: true } });

    const s = await getSettings();
    expect(Object.keys(s.sitePrefs).sort()).toEqual([
      'http://example.com:8443',
      'https://example.com:8443',
    ]);
  });

  // `file://x` has an empty host, and parseToggleOrigin writes 'null' for it today.
  it("maps the legacy empty-host key to the 'null' origin", async () => {
    await seedRawSitePrefs({ '': { disabled: true } });

    const s = await getSettings();
    expect(Object.keys(s.sitePrefs)).toEqual(['null']);
    expect(resolveEffective(s, 'null').disabled).toBe(true);
  });

  it('is idempotent — a second read produces the same map', async () => {
    await seedRawSitePrefs({ 'example.com': { disabled: true } });

    const first = await getSettings();
    await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: first as unknown as Settings });
    const second = await getSettings();

    expect(second.sitePrefs).toEqual(first.sitePrefs);
  });

  it('does not merge two entries for the same site — the origin entry keeps its own fields', async () => {
    await seedRawSitePrefs({
      'example.com': { disabled: true },
      'https://example.com': { disabled: false, defaultLang: 'es' },
    });

    const s = await getSettings();
    expect(Object.keys(s.sitePrefs).sort()).toEqual(['http://example.com', 'https://example.com']);
    expect(s.sitePrefs['https://example.com']?.defaultLang).toBe('es');
    // The off state must survive the collision.
    expect(s.sitePrefs['https://example.com']?.disabled).toBe(true);
  });

  it('leaves an origin-shaped key untouched', async () => {
    await seedRawSitePrefs({ 'https://kept.example': { disabled: true } });

    const s = await getSettings();
    expect(Object.keys(s.sitePrefs)).toEqual(['https://kept.example']);
  });

  it('leaves a key that is not a host alone instead of guessing', async () => {
    await seedRawSitePrefs({ 'example.com/path': { disabled: true } });

    const s = await getSettings();
    expect(Object.keys(s.sitePrefs)).toEqual(['example.com/path']);
  });
});
