// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { parseCustomLanguageRows, sanitiseStoredSettings } from '@/shared/storage/sanitise';
import { materializeVarieties } from '@/shared/varieties';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { buildPrompt, DEFAULT_TEMPLATE } from '@/shared/prompts';
import { asLangIdUnsafe, asLangSelection } from '@/shared/brands';
import type { TranslationRequest } from '@/shared/types';

afterEach(() => {
  vi.restoreAllMocks();
});

function quiet(): MockInstance {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

const NESTED = { regex: '(a+)+$', flags: '', minScore: 1 };
const SANE = { regex: '\\bzz\\w*\\b', flags: 'i', minScore: 2 };

describe('a stored custom language row that fails the schema', () => {
  it('is kept with an empty hint and no examples', () => {
    quiet();
    const rows = parseCustomLanguageRows([{ id: 'x', label: 'X', createdAt: 1 }], 'keep');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.hint).toBe('');
    expect(rows[0]?.examples).toEqual([]);
  });

  it('renders as an auto-detect candidate without throwing', () => {
    quiet();
    const rows = parseCustomLanguageRows([{ id: 'x', label: 'X', createdAt: 1 }], 'keep');
    const candidates = materializeVarieties(DEFAULT_SETTINGS, rows, { enabledOnly: true }).map(
      (v) => ({ id: v.id, label: v.label, hint: v.hint, examples: v.examples }),
    );
    const req: TranslationRequest = {
      id: 'r',
      text: 'hola',
      sourceLang: asLangSelection('auto'),
      targetLang: asLangIdUnsafe('en'),
      options: { stream: false, explain: false },
    };
    expect(() =>
      buildPrompt(req, { preset: undefined, template: DEFAULT_TEMPLATE, candidates }),
    ).not.toThrow();
  });

  it('keeps a hint and examples the row already has', () => {
    quiet();
    const rows = parseCustomLanguageRows(
      [{ id: 'x', label: 'X', hint: 'h', examples: [{ src: 's', tgt: 't' }], createdAt: 'no' }],
      'keep',
    );

    expect(rows[0]?.hint).toBe('h');
    expect(rows[0]?.examples).toEqual([{ src: 's', tgt: 't' }]);
  });
});

describe('a custom language whose detection pattern nests one repeat inside another', () => {
  const row = { id: 'x', label: 'X', hint: 'h', examples: [], createdAt: 1 };

  it.each(['keep', 'drop'] as const)(
    'keeps the language but drops the pattern (%s mode)',
    (mode) => {
      const warn = quiet();

      const rows = parseCustomLanguageRows([{ ...row, autoDetect: NESTED }], mode);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.autoDetect).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('customLanguages[x].autoDetect'));
    },
  );

  it('drops a pattern whose long optional run would hang the compile', () => {
    quiet();
    const slow = { regex: 'a?'.repeat(36) + 'a{36}', flags: '', minScore: 1 };

    const rows = parseCustomLanguageRows([{ ...row, autoDetect: slow }], 'keep');

    expect(rows[0]?.autoDetect).toBeUndefined();
  });

  it('leaves a pattern with no nested repeat alone', () => {
    const rows = parseCustomLanguageRows([{ ...row, autoDetect: SANE }], 'drop');

    expect(rows[0]?.autoDetect).toEqual(SANE);
  });
});

describe('a stored built-in override whose detection pattern nests one repeat inside another', () => {
  it('keeps the other edits but drops the pattern', () => {
    const warn = quiet();

    const out = sanitiseStoredSettings(
      { varietyOverrides: { arabizi: { hint: 'h', autoDetect: NESTED } } },
      [],
    );

    expect(out.varietyOverrides['arabizi']).toEqual({ hint: 'h' });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('varietyOverrides[arabizi].autoDetect'),
    );
  });

  it('leaves a pattern with no nested repeat alone', () => {
    const out = sanitiseStoredSettings({ varietyOverrides: { arabizi: { autoDetect: SANE } } }, []);

    expect(out.varietyOverrides['arabizi']?.autoDetect).toEqual(SANE);
  });
});
