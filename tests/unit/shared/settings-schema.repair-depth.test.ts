import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseStoredSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

const rule = {
  id: 'r1',
  body: 'always keep names untranslated',
  category: 'always',
  scope: { tasks: [] },
  source: 'manual',
  addedAt: '2026-08-10T00:00:00.000Z',
  enabled: true,
};

function advancedWith(over: Record<string, unknown>): Record<string, unknown> {
  return {
    ...DEFAULT_SETTINGS,
    advanced: {
      ...DEFAULT_SETTINGS.advanced,
      rules: [rule],
      snippets: { greeting: 'hello there' },
      ...over,
    },
  } as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an unfixable value under advanced resets that key alone, never the section', () => {
  it('a bad advanced.temperature goes back to its default; the rules and snippets stay', () => {
    const out = parseStoredSettings(advancedWith({ temperature: 'warm' }), {
      defaults: DEFAULT_SETTINGS,
    });
    expect(out.advanced.temperature).toBe(DEFAULT_SETTINGS.advanced.temperature);
    expect(out.advanced.rules.map((r) => r.id)).toEqual(['r1']);
    expect(out.advanced.snippets).toEqual({ greeting: 'hello there' });
  });

  it('a rule site over 2048 chars is clamped, not the section', () => {
    const out = parseStoredSettings(
      advancedWith({ rules: [{ ...rule, scope: { tasks: [], sites: ['x'.repeat(3000)] } }] }),
      { defaults: DEFAULT_SETTINGS },
    );
    expect(out.advanced.rules[0]?.scope.sites?.[0]?.length).toBe(2048);
    expect(out.advanced.snippets).toEqual({ greeting: 'hello there' });
  });

  it('an unknown task key in taskTones is dropped and the valid entries stay', () => {
    const out = parseStoredSettings(
      advancedWith({ taskTones: { bogus: 'formal', translate: 'formal' } }),
      { defaults: DEFAULT_SETTINGS },
    );
    expect(out.advanced.taskTones).toEqual({ translate: 'formal' });
    expect(out.advanced.rules.map((r) => r.id)).toEqual(['r1']);
  });

  it('still resets the whole section when advanced itself is not an object', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = parseStoredSettings(
      { ...DEFAULT_SETTINGS, advanced: 'nope' },
      {
        defaults: DEFAULT_SETTINGS,
      },
    );
    expect(out.advanced).toEqual(DEFAULT_SETTINGS.advanced);
  });
});
