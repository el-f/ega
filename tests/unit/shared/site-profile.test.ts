import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resolveEffective, swapDirection } from '@/shared/site-profile';
import type { Settings } from '@/shared/types';
import { sel } from '@tests/_helpers/lang';

function withPref(pref: Partial<Settings['sitePrefs'][string]>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    sitePrefs: {
      'https://discord.com': { disabled: false, ...pref },
    },
  };
}

describe('resolveEffective', () => {
  it('returns global defaults when host has no pref', () => {
    const eff = resolveEffective(DEFAULT_SETTINGS, 'https://example.com');
    expect(eff.defaultLang).toBe(DEFAULT_SETTINGS.defaultLang);
    expect(eff.displayMode).toBe(DEFAULT_SETTINGS.defaultDisplayMode);
    expect(eff.disabled).toBe(false);
  });

  it('overrides defaultLang when site pref sets one', () => {
    const s = withPref({ defaultLang: sel('genz') });
    const eff = resolveEffective(s, 'https://discord.com');
    expect(eff.defaultLang).toBe('genz');
  });

  it('disabled=true from sitePref propagates', () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      sitePrefs: { 'https://off.example': { disabled: true } },
    };
    expect(resolveEffective(s, 'https://off.example').disabled).toBe(true);
  });

  it('direction defaults to (defaultLang, defaultTargetLang) when no sitePref', () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      defaultLang: 'auto',
      defaultTargetLang: sel('en'),
    };
    expect(resolveEffective(s, 'https://fresh.example').direction).toEqual({
      source: 'auto',
      target: 'en',
    });
  });

  it('lastDirection on sitePref overrides the global direction', () => {
    const s = withPref({ lastDirection: { source: sel('en'), target: sel('es') } });
    expect(resolveEffective(s, 'https://discord.com').direction).toEqual({
      source: 'en',
      target: 'es',
    });
  });

  it('direction respects defaultLang override too when lastDirection absent', () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      defaultTargetLang: sel('fr'),
      sitePrefs: {
        'https://discord.com': {
          disabled: false,
          defaultLang: sel('arabizi'),
        },
      },
    };
    expect(resolveEffective(s, 'https://discord.com').direction).toEqual({
      source: 'arabizi',
      target: 'fr',
    });
  });
});

describe('swapDirection', () => {
  it('swaps source and target', () => {
    expect(swapDirection({ source: sel('es'), target: sel('en') })).toEqual({
      source: 'en',
      target: 'es',
    });
  });

  it('allows auto on the target side (reverse edge case)', () => {
    expect(swapDirection({ source: 'auto', target: sel('en') })).toEqual({
      source: 'en',
      target: 'auto',
    });
  });

  it('is its own inverse', () => {
    const d = { source: sel('arabizi'), target: sel('en') };
    expect(swapDirection(swapDirection(d))).toEqual(d);
  });
});
