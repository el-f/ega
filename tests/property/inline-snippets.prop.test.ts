import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseStoredSettings, TEMPLATE_MAX } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resolveSnippets } from '@/shared/snippets';

const NAMES = ['a', 'b', 'c', 'gone'] as const;

// Text pieces that exercise refs, escaped refs, slots and a lone backslash before @@.
const piece = fc.oneof(
  fc.constantFrom(...NAMES).map((n) => `@@${n}@@`),
  fc.constantFrom(...NAMES).map((n) => `\\@@${n}@@`),
  fc.constantFrom('{{text}}', '{{context}}', '\\\\@@', ' ', '\n', '@@', 'x'),
  fc.string({ maxLength: 6 }),
);
const text = fc.array(piece, { maxLength: 8 }).map((p) => p.join(''));
// 'gone' is never defined, so an unknown ref stays literal; bodies may refer to each other (depth and cycles).
const snippetMap = fc.record({ a: text, b: text, c: text }, { requiredKeys: [] }) as fc.Arbitrary<
  Record<string, string>
>;

function rowWith(system: string, user: string, snippets: Record<string, string>): unknown {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    taskOverrides: { summarize: { system: user, user: system } },
    advanced: {
      ...structuredClone(DEFAULT_SETTINGS.advanced),
      promptTemplate: { system, user },
      perPresetTemplates: { arabizi: { system: user, user: system } },
      snippets,
      customSlotDescriptions: { tone: 'a note' },
    },
  };
}

describe('snippets are written out on read', () => {
  it('every prompt reads the same at runtime, and the snippet map is gone', () => {
    fc.assert(
      fc.property(text, text, snippetMap, (system, user, snippets) => {
        const out = parseStoredSettings(rowWith(system, user, snippets), {
          defaults: DEFAULT_SETTINGS,
        });
        const run = (t: string): string => resolveSnippets(t, out.advanced.snippets);
        expect(out.advanced.snippets).toEqual({});
        expect(run(out.advanced.promptTemplate.system)).toBe(resolveSnippets(system, snippets));
        expect(run(out.advanced.promptTemplate.user)).toBe(resolveSnippets(user, snippets));
        expect(run(out.advanced.perPresetTemplates['arabizi']?.user ?? '')).toBe(
          resolveSnippets(system, snippets),
        );
        expect(run(out.taskOverrides.summarize?.system ?? '')).toBe(
          resolveSnippets(user, snippets),
        );
        expect(out.advanced).not.toHaveProperty('customSlotDescriptions');
      }),
      { numRuns: 300 },
    );
  });

  it('leaves everything as it was when one prompt would pass the cap', () => {
    fc.assert(
      fc.property(text, snippetMap, (user, snippets) => {
        const big = { ...snippets, a: 'x'.repeat(8192) };
        const system = '@@a@@@@a@@';
        const out = parseStoredSettings(rowWith(system, user, big), {
          defaults: DEFAULT_SETTINGS,
        });
        expect(resolveSnippets(system, big).length).toBeGreaterThan(TEMPLATE_MAX);
        expect(out.advanced.snippets).toEqual(big);
        expect(out.advanced.promptTemplate).toEqual({ system, user });
        expect(out.taskOverrides.summarize).toEqual({ system: user, user: system });
      }),
      { numRuns: 100 },
    );
  });
});

describe('the written-out text matches what the clamp used to keep', () => {
  const read = (snippets: Record<string, unknown>, user: string) =>
    parseStoredSettings(
      {
        ...structuredClone(DEFAULT_SETTINGS),
        advanced: {
          ...structuredClone(DEFAULT_SETTINGS.advanced),
          promptTemplate: { system: 'S', user },
          snippets,
        },
      },
      { defaults: DEFAULT_SETTINGS },
    );

  it('cuts a body past 8192 characters instead of dropping it', () => {
    const out = read({ sig: 'y'.repeat(9000) }, 'T @@sig@@ {{text}}');
    expect(out.advanced.promptTemplate.user).toBe(`T ${'y'.repeat(8192)} {{text}}`);
    expect(out.advanced.snippets).toEqual({});
  });

  it('never writes out a name the record drops, like constructor', () => {
    const snippets = JSON.parse('{"constructor":"BAD","ok":"fine"}') as Record<string, unknown>;
    const out = read(snippets, '@@constructor@@ @@ok@@ {{text}}');
    expect(out.advanced.promptTemplate.user).toBe('@@constructor@@ fine {{text}}');
  });
});
