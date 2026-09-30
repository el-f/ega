import { describe, it, expect } from 'vitest';
import { parseStoredSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

// Field repair replaces a whole top-level key, so one over-cap value under `advanced` resets every sibling.
function advancedWith(over: Record<string, unknown>): Record<string, unknown> {
  return {
    ...DEFAULT_SETTINGS,
    advanced: {
      ...DEFAULT_SETTINGS.advanced,
      rules: [
        {
          id: 'r1',
          body: 'always keep names untranslated',
          category: 'always',
          scope: { tasks: [] },
          source: 'manual',
          addedAt: '2026-08-10T00:00:00.000Z',
          enabled: true,
        },
      ],
      snippets: { greeting: 'hello there' },
      temperature: 1.1,
      ...over,
    },
  } as Record<string, unknown>;
}

describe('preCleanForStorage — an over-cap value under advanced must not reset its siblings', () => {
  it('truncates an over-long global prompt template instead of wiping advanced', () => {
    const raw = advancedWith({
      promptTemplate: { system: 'S'.repeat(17_000), user: 'keep me' },
    });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.advanced.rules).toHaveLength(1);
    expect(out.advanced.snippets).toEqual({ greeting: 'hello there' });
    expect(out.advanced.temperature).toBe(1.1);
    expect(out.advanced.promptTemplate.system).toHaveLength(16_000);
    expect(out.advanced.promptTemplate.user).toBe('keep me');
  });

  it('truncates an over-long user template too', () => {
    const raw = advancedWith({
      promptTemplate: { system: 'keep me', user: 'U'.repeat(17_000) },
    });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.advanced.rules).toHaveLength(1);
    expect(out.advanced.promptTemplate.user).toHaveLength(16_000);
    expect(out.advanced.promptTemplate.system).toBe('keep me');
  });

  it('clamps an over-cap userRecipes list instead of wiping advanced', () => {
    const recipes = Array.from({ length: 51 }, (_, i) => ({ id: `rec-${i}`, label: `r${i}` }));
    const raw = advancedWith({ userRecipes: recipes });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.advanced.rules).toHaveLength(1);
    expect(out.advanced.snippets).toEqual({ greeting: 'hello there' });
    expect(out.advanced.userRecipes).toHaveLength(50);
  });

  it('leaves a template at exactly the cap alone', () => {
    const raw = advancedWith({
      promptTemplate: { system: 'S'.repeat(16_000), user: 'u' },
    });

    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

    expect(out.advanced.promptTemplate.system).toHaveLength(16_000);
    expect(out.advanced.rules).toHaveLength(1);
  });
});
