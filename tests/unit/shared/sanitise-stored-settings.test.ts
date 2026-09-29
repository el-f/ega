// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitiseStoredSettings } from '@/shared/storage/sanitise';
import { BUILT_IN_PRESETS } from '@/shared/presets';

afterEach(() => {
  vi.restoreAllMocks();
});

function sanitise(stored: Record<string, unknown>): ReturnType<typeof sanitiseStoredSettings> {
  return sanitiseStoredSettings(stored, []);
}

describe('a stored backendOrder that is not a list of ids', () => {
  it('names the row it drops when an entry is not a string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    sanitise({ backendOrder: ['anthropic', 42] });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('backendOrder[]'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('42'));
  });

  it('names the whole field when it is not an array at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = sanitise({ backendOrder: 'anthropic' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('backendOrder ='));
    expect(out.backendOrder.length).toBeGreaterThan(0);
  });

  it('says nothing when the field is simply absent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    sanitise({});

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('backendOrder'));
  });
});

describe('two stored key shapes for one site', () => {
  it('keeps the origin row fields and lets an off switch from either key win', () => {
    const out = sanitise({
      sitePrefs: {
        'https://example.com': { disabled: false, defaultLang: 'fr' },
        'example.com': { disabled: true, defaultLang: 'de' },
      },
    });

    const pref = out.sitePrefs['https://example.com'];
    expect(pref?.disabled).toBe(true);
    expect(pref?.defaultLang).toBe('fr');
  });

  it('is still off when the origin row is the one that carries the off switch', () => {
    const out = sanitise({
      sitePrefs: {
        'example.com': { disabled: false },
        'https://example.com': { disabled: true },
      },
    });

    expect(out.sitePrefs['https://example.com']?.disabled).toBe(true);
  });

  it('stays on when neither key is off', () => {
    const out = sanitise({
      sitePrefs: {
        'example.com': { disabled: false },
        'https://example.com': { disabled: false },
      },
    });

    expect(out.sitePrefs['https://example.com']?.disabled).toBe(false);
  });
});

describe('a stored lastDirection', () => {
  function direction(source: unknown, target: unknown): ReturnType<typeof sanitise> {
    return sanitise({
      sitePrefs: { 'https://a.com': { lastDirection: { source, target } } },
    });
  }

  it('keeps a pair of real language codes', () => {
    const out = direction('en', 'fr');

    expect(out.sitePrefs['https://a.com']?.lastDirection).toEqual({ source: 'en', target: 'fr' });
  });

  it('keeps auto on either side', () => {
    expect(direction('auto', 'fr').sitePrefs['https://a.com']?.lastDirection).toEqual({
      source: 'auto',
      target: 'fr',
    });
    expect(direction('en', 'auto').sitePrefs['https://a.com']?.lastDirection).toEqual({
      source: 'en',
      target: 'auto',
    });
  });

  const ignored: Array<[string, unknown, unknown]> = [
    ['the source is empty', '', 'fr'],
    ['the target is empty', 'en', ''],
    ['the source is not a string', 7, 'fr'],
    ['the target is not a string', 'en', 7],
  ];

  for (const [what, source, target] of ignored) {
    it(`is ignored without a word when ${what}`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const out = direction(source, target);

      expect(out.sitePrefs['https://a.com']?.lastDirection).toBeUndefined();
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('lastDirection'));
    });
  }

  // The schema clamps an over-long code to 64, so the pattern check rejects it, not the length guard.
  const namedDrops: Array<[string, unknown, unknown]> = [
    ['the source is longer than the 64-character cap', 'e'.repeat(65), 'fr'],
    ['the target is longer than the 64-character cap', 'en', 'f'.repeat(65)],
  ];

  for (const [what, source, target] of namedDrops) {
    it(`names the row it drops when ${what}`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const out = direction(source, target);

      expect(out.sitePrefs['https://a.com']?.lastDirection).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('lastDirection'));
    });
  }
});

describe('a stored per-site defaultLang', () => {
  function pref(defaultLang: unknown): ReturnType<typeof sanitise> {
    return sanitise({ sitePrefs: { 'https://a.com': { defaultLang } } });
  }

  it('keeps a real code', () => {
    expect(pref('de').sitePrefs['https://a.com']?.defaultLang).toBe('de');
  });

  it('ignores an empty string without a word', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(pref('').sitePrefs['https://a.com']?.defaultLang).toBeUndefined();
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('defaultLang'));
  });

  it('drops a code the schema does not accept before the site pref is built', () => {
    expect(pref('not a lang').sitePrefs['https://a.com']?.defaultLang).toBeUndefined();
  });

  it('drops a code the schema clamps into shape but nothing registers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(pref('x'.repeat(65)).sitePrefs['https://a.com']?.defaultLang).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('sitePrefs[https://a.com].defaultLang'),
    );
  });
});

describe('references to things that no longer exist', () => {
  it('drops a disabled variety that is not registered, and names it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = sanitise({ disabledVarieties: ['gone-variety'] });

    expect(out.disabledVarieties).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disabledVarieties[]'));
  });

  it('drops a variety override keyed on an unregistered id, and names it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = sanitise({ varietyOverrides: { 'gone-variety': { label: 'x' } } });

    expect(out.varietyOverrides).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('varietyOverrides[gone-variety]'));
  });

  it('drops a disabled backend that is not registered, and names it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = sanitise({ disabledBackends: ['gone-backend'] });

    expect(out.disabledBackends).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disabledBackends[]'));
  });

  it('drops a task pinned to a backend that is not registered, and names it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = sanitise({ taskBackends: { translate: 'gone-backend' } });

    expect(out.taskBackends['translate']).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('taskBackends.translate'));
  });
});

describe('the two default languages', () => {
  it('keeps auto as the source default but never as the target', () => {
    const out = sanitise({ defaultLang: 'auto', defaultTargetLang: 'auto' });

    expect(out.defaultLang).toBe('auto');
    expect(out.defaultTargetLang).not.toBe('auto');
  });

  it('falls back to the shipped defaults when a stored code is not one it knows', () => {
    const out = sanitise({ defaultLang: 'not a lang', defaultTargetLang: 'also not' });

    expect(out.defaultLang).toBe('auto');
    expect(out.defaultTargetLang).toBe(sanitise({}).defaultTargetLang);
  });

  it('keeps a registered variety id, which is not a language code', () => {
    const out = sanitise({ defaultLang: 'arabizi', defaultTargetLang: 'leetspeak' });

    expect(out.defaultLang).toBe('arabizi');
    expect(out.defaultTargetLang).toBe('leetspeak');
  });

  // A variety id is preset-shaped, so only the registry can reject it — the one route to checkLang's warning.
  it('drops a variety that was deleted since it was stored, and names the field', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = sanitise({ defaultLang: 'deleted-variety', defaultTargetLang: 'gone-too' });

    expect(out.defaultLang).toBe('auto');
    expect(out.defaultTargetLang).toBe(sanitise({}).defaultTargetLang);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('defaultLang = "deleted-variety"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('defaultTargetLang = "gone-too"'));
  });

  it('sends a stored target of auto back to the shipped target, not to auto', () => {
    // 'auto' as a target would ask the model to translate into the source language.
    expect(sanitise({ defaultTargetLang: 'auto' }).defaultTargetLang).not.toBe('auto');
    expect(sanitise({ defaultLang: 'auto' }).defaultLang).toBe('auto');
  });

  it('keeps codes it does know', () => {
    const out = sanitise({ defaultLang: 'de', defaultTargetLang: 'fr' });

    expect(out.defaultLang).toBe('de');
    expect(out.defaultTargetLang).toBe('fr');
  });
});

describe('a variety override with holes in it', () => {
  it('drops keys whose value is undefined instead of storing the hole', () => {
    const out = sanitise({
      varietyOverrides: { arabizi: { label: 'Kept', hint: undefined } },
    });

    const edit = out.varietyOverrides['arabizi'];
    expect(edit?.label).toBe('Kept');
    expect(edit && 'hint' in edit).toBe(false);
  });

  it('keeps a field that is present and empty, which is a real edit', () => {
    const out = sanitise({ varietyOverrides: { arabizi: { label: '' } } });

    const edit = out.varietyOverrides['arabizi'];
    expect(edit && 'label' in edit).toBe(true);
    expect(edit?.label).toBe('');
  });
});

describe('an empty stored language', () => {
  it('falls back to the shipped default rather than being treated as a code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shipped = sanitise({});

    const out = sanitise({ defaultLang: '', defaultTargetLang: '' });

    expect(out.defaultLang).toBe(shipped.defaultLang);
    expect(out.defaultTargetLang).toBe(shipped.defaultTargetLang);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('defaultLang ='));
  });
});

describe('site keys that are not hosts', () => {
  it('keeps an already-canonical origin as the single key', () => {
    const out = sanitise({ sitePrefs: { 'https://example.com': { disabled: true } } });

    expect(Object.keys(out.sitePrefs)).toEqual(['https://example.com']);
  });

  it('keeps a key that cannot be read as a URL as itself', () => {
    const out = sanitise({ sitePrefs: { 'not a host': { disabled: true } } });

    expect(Object.keys(out.sitePrefs)).toEqual(['not a host']);
  });

  it('writes the empty key as null, which is what a file:// page stores', () => {
    const out = sanitise({ sitePrefs: { '': { disabled: true } } });

    expect(Object.keys(out.sitePrefs)).toEqual(['null']);
  });
});

// A stored copy of a shipped field would shadow every later fix to the built-in preset.
describe('a built-in variety override on read', () => {
  it("drops fields that equal the shipped preset and keeps the user's own", () => {
    const arabizi = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi');
    if (!arabizi) throw new Error('arabizi preset missing');
    const own = [{ src: 'yalla', tgt: "let's go" }];
    const out = sanitise({
      varietyOverrides: {
        arabizi: { hint: arabizi.hint, autoDetect: arabizi.autoDetect, examples: own },
      },
    });
    expect(out.varietyOverrides['arabizi']).toEqual({ examples: own });
  });

  it('drops an override that only copies the preset', () => {
    const arabizi = BUILT_IN_PRESETS.find((p) => p.id === 'arabizi');
    if (!arabizi) throw new Error('arabizi preset missing');
    const out = sanitise({ varietyOverrides: { arabizi: { hint: arabizi.hint } } });
    expect(out.varietyOverrides['arabizi']).toBeUndefined();
  });
});
