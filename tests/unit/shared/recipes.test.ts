import { describe, it, expect } from 'vitest';
import { BUNDLED_RECIPES, deserialiseRecipe, serialiseRecipe, type Recipe } from '@/shared/recipes';
import { ALL_TASKS, type Task } from '@/shared/task-prompts';
import { RULE_BODY_MAX } from '@/shared/settings-schema';

describe('BUNDLED_RECIPES shape', () => {
  it('every recipe has id + task + label + description', () => {
    expect(BUNDLED_RECIPES.length).toBeGreaterThan(0);
    for (const r of BUNDLED_RECIPES) {
      expect(typeof r.id).toBe('string');
      expect(r.id.length).toBeGreaterThan(0);
      expect(ALL_TASKS).toContain(r.task);
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
      expect(typeof r.description).toBe('string');
      expect(r.description.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = BUNDLED_RECIPES.map((r) => r.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('ids are kebab-case ASCII', () => {
    for (const r of BUNDLED_RECIPES) {
      expect(r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('ships the documented bundled count (≈22, core tasks covered)', () => {
    expect(BUNDLED_RECIPES.length).toBe(21);
    const tasks = new Set(BUNDLED_RECIPES.map((r) => r.task));
    // 'ask' is a conversational follow-up task — no bundled recipes for it.
    const expectedTasks = new Set(ALL_TASKS.filter((t) => t !== 'ask'));
    expect(tasks).toEqual(expectedTasks);
  });

  it('per-task counts match the spec gallery', () => {
    const counts: Record<Task, number> = {
      translate: 0,
      explain: 0,
      summarize: 0,
      reword: 0,
      grammar: 0,
      'suggest-replies': 0,
      ask: 0,
    };
    for (const r of BUNDLED_RECIPES) counts[r.task] += 1;
    expect(counts).toEqual({
      translate: 4,
      explain: 4,
      summarize: 3,
      reword: 4,
      grammar: 3,
      'suggest-replies': 3,
      ask: 0,
    });
  });

  it('rule entries (when present) carry a body + valid category', () => {
    const validCategories = new Set(['always', 'never', 'prefer', 'format', 'unknown']);
    for (const r of BUNDLED_RECIPES) {
      if (!r.rules) continue;
      for (const rule of r.rules) {
        expect(typeof rule.body).toBe('string');
        expect(rule.body.length).toBeGreaterThan(0);
        expect(validCategories.has(rule.category)).toBe(true);
      }
    }
  });
});

describe('serialiseRecipe / deserialiseRecipe', () => {
  it('round-trips a minimal recipe', () => {
    const r: Recipe = {
      id: 'roundtrip-1',
      task: 'translate',
      label: 'RT',
      description: 'desc',
    };
    const s = serialiseRecipe(r);
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
    const back = deserialiseRecipe(s);
    expect(back).toEqual(r);
  });

  it('round-trips a recipe carrying rules + generationParams + template', () => {
    const r: Recipe = {
      id: 'roundtrip-2',
      task: 'reword',
      label: 'Loaded',
      description: 'with everything',
      template: { system: 'sys', user: 'usr {{text}}' },
      rules: [
        { body: 'always X', category: 'always' },
        { body: 'never Y', category: 'never', scopeSites: ['example.com'] },
      ],
      generationParams: { temperature: 0.4, maxTokens: 280, tone: 'formal' },
    };
    const back = deserialiseRecipe(serialiseRecipe(r));
    expect(back).toEqual(r);
  });

  it('returns null for malformed base64', () => {
    expect(deserialiseRecipe('!!! not base64 !!!')).toBeNull();
  });

  it('returns null for valid base64 carrying non-JSON', () => {
    const garbage = btoa(encodeURIComponent('hello world, not json'));
    expect(deserialiseRecipe(garbage)).toBeNull();
  });

  it('returns null for valid JSON without the expected envelope kind', () => {
    const wrong = btoa(encodeURIComponent(JSON.stringify({ kind: 'something-else', recipe: {} })));
    expect(deserialiseRecipe(wrong)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(deserialiseRecipe('')).toBeNull();
  });
});

describe('deserialiseRecipe — schema validation', () => {
  function encode(recipe: unknown): string {
    return btoa(encodeURIComponent(JSON.stringify({ kind: 'ega-recipe', recipe })));
  }

  it('returns null when required fields missing', () => {
    expect(
      deserialiseRecipe(encode({ id: 'x', task: 'translate' /* missing label, description */ })),
    ).toBeNull();
  });

  it('returns null when task is unknown', () => {
    expect(
      deserialiseRecipe(encode({ id: 'x', task: 'mystery-task', label: 'X', description: 'd' })),
    ).toBeNull();
  });

  it('returns null when a rule body exceeds the storage cap', () => {
    const bad = {
      id: 'x',
      task: 'translate',
      label: 'X',
      description: 'd',
      rules: [{ body: 'x'.repeat(RULE_BODY_MAX + 1), category: 'always' }],
    };
    expect(deserialiseRecipe(encode(bad))).toBeNull();
  });

  it('accepts a rule body right at the storage cap', () => {
    const ok = {
      id: 'x',
      task: 'translate',
      label: 'X',
      description: 'd',
      rules: [{ body: 'x'.repeat(RULE_BODY_MAX), category: 'always' }],
    };
    expect(deserialiseRecipe(encode(ok))).not.toBeNull();
  });

  it('returns null when rules.length exceeds 50', () => {
    const rules = Array.from({ length: 51 }, () => ({ body: 'b', category: 'always' as const }));
    expect(
      deserialiseRecipe(
        encode({ id: 'x', task: 'translate', label: 'X', description: 'd', rules }),
      ),
    ).toBeNull();
  });

  it('strips a retired responseFormat key from generationParams', () => {
    const back = deserialiseRecipe(
      encode({
        id: 'x',
        task: 'translate',
        label: 'X',
        description: 'd',
        generationParams: { temperature: 0.5, responseFormat: 'json' },
      }),
    );
    expect(back).not.toBeNull();
    expect(back?.generationParams).toEqual({ temperature: 0.5 });
  });

  it('returns null when temperature is out of [0, 2]', () => {
    const high = encode({
      id: 'x',
      task: 'translate',
      label: 'X',
      description: 'd',
      generationParams: { temperature: 99 },
    });
    expect(deserialiseRecipe(high)).toBeNull();
    const low = encode({
      id: 'x',
      task: 'translate',
      label: 'X',
      description: 'd',
      generationParams: { temperature: -1 },
    });
    expect(deserialiseRecipe(low)).toBeNull();
  });

  it('returns null when maxTokens is out of [16, 8192]', () => {
    expect(
      deserialiseRecipe(
        encode({
          id: 'x',
          task: 'translate',
          label: 'X',
          description: 'd',
          generationParams: { maxTokens: 1_000_000 },
        }),
      ),
    ).toBeNull();
  });

  it('returns null when tone is unknown', () => {
    expect(
      deserialiseRecipe(
        encode({
          id: 'x',
          task: 'reword',
          label: 'X',
          description: 'd',
          generationParams: { tone: 'apocalyptic' },
        }),
      ),
    ).toBeNull();
  });

  it('strips __proto__ before parse so payload cannot pollute Object prototype', () => {
    const payload = JSON.stringify({
      kind: 'ega-recipe',
      recipe: {
        id: 'x',
        task: 'translate',
        label: 'X',
        description: 'd',
        __proto__: { polluted: 'yes' },
      },
    });
    const encoded = btoa(encodeURIComponent(payload));
    const result = deserialiseRecipe(encoded);
    expect(result).not.toBeNull();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('accepts a valid recipe with rules + generationParams + template (happy path)', () => {
    const r: Recipe = {
      id: 'happy',
      task: 'reword',
      label: 'OK',
      description: 'd',
      template: { system: 's', user: 'u' },
      rules: [{ body: 'be kind', category: 'always' }],
      generationParams: { temperature: 0.7, maxTokens: 256, tone: 'casual' },
    };
    expect(deserialiseRecipe(serialiseRecipe(r))).toEqual(r);
  });
});
