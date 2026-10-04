import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import {
  parseSettingsPatch,
  parseSettings,
  parseStoredSettings,
  settingsSchema,
} from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { sanitiseStoredSettings } from '@/shared/storage/sanitise';
import { resolveTaskEffort } from '@/shared/backend-params';
import { asBackendIdUnsafe } from '@/shared/brands';

/** The schema validates msg.patch at the wire boundary before updateSettings sees it. */
describe('settingsSchema (full shape)', () => {
  it('DEFAULT_SETTINGS round-trips through the schema', () => {
    const parsed = parseSettings(DEFAULT_SETTINGS);
    expect(parsed.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(parsed.defaultTask).toBe(DEFAULT_SETTINGS.defaultTask);
    expect(parsed.defaultTone).toBe(DEFAULT_SETTINGS.defaultTone);
    expect(parsed.advanced.temperature).toBe(DEFAULT_SETTINGS.advanced.temperature);
    expect(parsed.taskOverrides).toEqual(DEFAULT_SETTINGS.taskOverrides);
    expect(parsed.backendOrder).toEqual(DEFAULT_SETTINGS.backendOrder);
  });

  it('pageTranslateMode defaults to inplace and accepts bilingual', () => {
    expect(DEFAULT_SETTINGS.pageTranslateMode).toBe('inplace');
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, pageTranslateMode: 'bilingual' });
    expect(parsed.pageTranslateMode).toBe('bilingual');
  });

  it('pageTranslateMode rejects unknown values at the wire boundary', () => {
    const bad = { ...DEFAULT_SETTINGS, pageTranslateMode: 'sideways' } as unknown;
    expect(() => v.parse(settingsSchema, bad)).toThrow();
  });

  it('rejects oversized prompt template at the schema boundary', () => {
    const bad = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        promptTemplate: { system: 'x'.repeat(16_001), user: 'ok' },
      },
    };
    expect(() => parseSettings(bad)).toThrow();
  });

  it('rejects unknown task ids in taskOverrides', () => {
    const bad = {
      ...DEFAULT_SETTINGS,
      taskOverrides: { 'no-such-task': { system: 'x' } },
    };
    expect(() => parseSettings(bad)).toThrow();
  });

  it('rejects unknown top-level fields (.strict)', () => {
    const bad = { ...DEFAULT_SETTINGS, totallyFakeField: 42 } as unknown;
    expect(() => v.parse(settingsSchema, bad)).toThrow();
  });

  it('accepts the new OpenAI-compat provider api keys', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      togetherApiKey: 'tg',
      mistralApiKey: 'mi',
      xaiApiKey: 'xa',
      fireworksApiKey: 'fw',
      openrouterApiKey: 'or',
    });
    expect(parsed.togetherApiKey).toBe('tg');
    expect(parsed.mistralApiKey).toBe('mi');
    expect(parsed.xaiApiKey).toBe('xa');
    expect(parsed.fireworksApiKey).toBe('fw');
    expect(parsed.openrouterApiKey).toBe('or');
  });

  it('model map carries a slot for each new provider with a non-empty default', () => {
    for (const id of ['together', 'mistral', 'xai', 'fireworks', 'openrouter'] as const) {
      expect(DEFAULT_SETTINGS.model[id].length).toBeGreaterThan(0);
    }
    const parsed = parseSettings(DEFAULT_SETTINGS);
    expect(parsed.model.together).toBe(DEFAULT_SETTINGS.model.together);
  });

  it('seeds the new providers into backendOrder, disabled by default (opt-in)', () => {
    for (const id of ['together', 'mistral', 'xai', 'fireworks', 'openrouter', 'localserver']) {
      expect(DEFAULT_SETTINGS.backendOrder).toContain(id);
      expect(DEFAULT_SETTINGS.disabledBackends).toContain(id);
    }
  });
});

describe('parseSettingsPatch', () => {
  it('accepts an empty patch (valid no-op)', () => {
    expect(parseSettingsPatch({})).toEqual({});
  });

  it('accepts a boolean flag patch', () => {
    expect(parseSettingsPatch({ streaming: false })).toEqual({ streaming: false });
  });

  it('accepts the deep-merged `model` shape', () => {
    const p = parseSettingsPatch({
      model: { anthropic: 'claude-opus-4-5', gemini: 'gemini-2-flash' },
    });
    expect(p.model).toEqual({ anthropic: 'claude-opus-4-5', gemini: 'gemini-2-flash' });
  });

  it('accepts the deep-merged `advanced` shape with bounded numbers', () => {
    const p = parseSettingsPatch({
      advanced: { temperature: 0.4, maxTokens: 2000 },
    });
    expect(p.advanced?.temperature).toBe(0.4);
  });

  it('REJECTS unknown top-level keys (prevents wire-junk from persisting)', () => {
    expect(() => parseSettingsPatch({ totallyFakeField: true })).toThrow();
  });

  it('REJECTS wrong types at a top-level field', () => {
    expect(() => parseSettingsPatch({ streaming: 'yes' as unknown as boolean })).toThrow();
    expect(() => parseSettingsPatch({ theme: 42 as unknown as string })).toThrow();
  });

  it('REJECTS backend ids with bad chars (no spaces / paths / special chars)', () => {
    expect(() => parseSettingsPatch({ backendOrder: ['anthropic pro'] as never })).toThrow();
    expect(() => parseSettingsPatch({ backendOrder: ['../etc/passwd'] as never })).toThrow();
  });

  it('REJECTS out-of-range temperature', () => {
    expect(() => parseSettingsPatch({ advanced: { temperature: 10 } })).toThrow();
    expect(() => parseSettingsPatch({ advanced: { temperature: -1 } })).toThrow();
  });

  it('REJECTS absurd maxTokens (wire-junk guard)', () => {
    expect(() => parseSettingsPatch({ advanced: { maxTokens: 10_000_000 } })).toThrow();
    expect(() => parseSettingsPatch({ advanced: { maxTokens: 0 } })).toThrow();
  });

  it('accepts a sitePrefs record', () => {
    const p = parseSettingsPatch({
      sitePrefs: {
        'example.com': { disabled: true, defaultLang: 'fr' },
      },
    });
    expect(p.sitePrefs?.['example.com']?.disabled).toBe(true);
    expect(p.sitePrefs?.['example.com']?.defaultLang).toBe('fr');
  });

  it('accepts taskOverrides with valid task ids, prompt halves and effort', () => {
    const p = parseSettingsPatch({
      taskOverrides: {
        summarize: { system: 'sys', user: 'usr {{text}}' },
        reword: { user: 'r-usr {{text}}', effort: 'high' },
      },
    });
    expect(p.taskOverrides?.summarize?.system).toBe('sys');
    expect(p.taskOverrides?.reword?.user).toBe('r-usr {{text}}');
    expect(p.taskOverrides?.reword?.effort).toBe('high');
  });

  it('REJECTS taskOverrides with an unknown task id', () => {
    expect(() =>
      parseSettingsPatch({
        taskOverrides: {
          'no-such-task': { effort: 'high' },
        } as unknown as Record<string, never>,
      }),
    ).toThrow();
  });

  it('defaults advanced.effort to off', () => {
    const parsed = parseSettings({});
    expect(parsed.advanced.effort).toBe('off');
  });

  describe('the old advanced.reasoningEffort key', () => {
    const read = (advanced: Record<string, unknown>) =>
      sanitiseStoredSettings({ advanced }, []).advanced;

    it.each(['low', 'high'] as const)('a picked %s carries over to effort', (level) => {
      const adv = read({ reasoningEffort: level });
      expect(adv.effort).toBe(level);
      expect(adv).not.toHaveProperty('reasoningEffort');
    });

    it('a carried-over High still reaches Explain and Ask, which ship at Low', () => {
      const s = sanitiseStoredSettings({ advanced: { reasoningEffort: 'high' } }, []);
      expect(resolveTaskEffort(s, 'explain')).toBe('high');
      expect(resolveTaskEffort(s, 'translate')).toBe('high');
    });

    it('medium, the old default every save wrote, is dropped for the new default', () => {
      expect(read({ reasoningEffort: 'medium' }).effort).toBe('off');
    });

    it('a row that already has effort keeps it, and a second read changes nothing', () => {
      const once = read({ reasoningEffort: 'high', effort: 'medium' });
      expect(once.effort).toBe('medium');
      expect(read(once as unknown as Record<string, unknown>)).toEqual(once);
    });
  });

  it('REJECTS an invalid task effort value', () => {
    expect(() =>
      parseSettingsPatch({
        taskOverrides: { summarize: { effort: 'extreme' } } as unknown as Record<string, never>,
      }),
    ).toThrow();
  });

  it('REJECTS oversized prompt template strings at the wire boundary', () => {
    const big = 'x'.repeat(16_001);
    expect(() =>
      parseSettingsPatch({ advanced: { promptTemplate: { system: big, user: 'ok' } } }),
    ).toThrow();
    expect(() =>
      parseSettingsPatch({
        taskOverrides: { summarize: { system: big } },
      }),
    ).toThrow();
  });

  it('deep-partial patch: accepts a model patch with only one provider', () => {
    const p = parseSettingsPatch({ model: { anthropic: 'claude-haiku-4-5' } });
    expect(p.model).toEqual({ anthropic: 'claude-haiku-4-5' });
  });

  it('deep-partial patch: accepts an advanced patch with only temperature', () => {
    const p = parseSettingsPatch({ advanced: { temperature: 0.7 } });
    expect(p.advanced?.temperature).toBe(0.7);
    expect(p.advanced?.promptTemplate).toBeUndefined();
  });

  it('deep-partial patch: accepts a sitePref entry with only `disabled`', () => {
    const p = parseSettingsPatch({
      sitePrefs: { 'example.com': { disabled: true } },
    });
    expect(p.sitePrefs?.['example.com']?.disabled).toBe(true);
  });

  it('REJECTS retired SitePref keys (autoBanner / displayMode / suppressBubble / promptTemplate) at the wire boundary', () => {
    // A patch naming a removed key is a caller bug: fail loudly instead of storing junk.
    expect(() =>
      parseSettingsPatch({
        sitePrefs: { 'example.com': { displayMode: 'inline' } as unknown as { disabled: boolean } },
      }),
    ).toThrow();
    expect(() =>
      parseSettingsPatch({
        sitePrefs: { 'example.com': { autoBanner: true } as unknown as { disabled: boolean } },
      }),
    ).toThrow();
  });
});

describe('parseStoredSettings drops bad fields and keeps good ones', () => {
  it('replaces a bad theme with the default but keeps siblings', () => {
    const raw = { ...DEFAULT_SETTINGS, theme: 'garbage', defaultLang: 'fr' };
    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
    expect(out.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(out.defaultLang).toBe('fr');
  });

  it('clamps an out-of-range advanced number and keeps the rest of the block', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      advanced: { ...DEFAULT_SETTINGS.advanced, temperature: 99, maxTokens: 4242 },
    };
    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
    expect(out.advanced.temperature).toBe(2);
    expect(out.advanced.maxTokens).toBe(4242);
  });

  it('drops unknown top-level fields without nuking known ones', () => {
    const raw = { ...DEFAULT_SETTINGS, totallyFakeField: 42, defaultLang: 'fr' };
    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
    expect(out.defaultLang).toBe('fr');
    expect((out as Record<string, unknown>)['totallyFakeField']).toBeUndefined();
  });

  it('returns shipped defaults when raw is not an object', () => {
    expect(parseStoredSettings(null, { defaults: DEFAULT_SETTINGS })).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings('nope', { defaults: DEFAULT_SETTINGS })).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings([], { defaults: DEFAULT_SETTINGS })).toEqual(DEFAULT_SETTINGS);
  });

  it('strips prototype-pollution keys from record-of-shaped-values fields', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        perPresetTemplates: {
          __proto__: { system: 'BAD', user: 'BAD' },
          arabizi: { system: 'ok', user: '{{text}}' },
        } as unknown as Record<string, never>,
      },
    };
    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
    expect(out.advanced.perPresetTemplates['arabizi']).toEqual({ system: 'ok', user: '{{text}}' });
    expect(Object.hasOwn(out.advanced.perPresetTemplates, '__proto__')).toBe(false);
  });

  it('keeps the stored gemini model id as-is (no silent rewrite)', () => {
    const raw = {
      ...DEFAULT_SETTINGS,
      model: { ...DEFAULT_SETTINGS.model, gemini: 'gemini-1.5-flash' },
    };
    const out = parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });
    expect(out.model.gemini).toBe('gemini-1.5-flash');
  });
});

describe('imageTranslateSurface', () => {
  it('defaults to "sidepanel"', () => {
    const s = v.parse(settingsSchema, {});
    expect(s.imageTranslateSurface).toBe('sidepanel');
  });
  it('accepts "tooltip" override', () => {
    const s = v.parse(settingsSchema, { imageTranslateSurface: 'tooltip' });
    expect(s.imageTranslateSurface).toBe('tooltip');
  });
  it('rejects unknown values', () => {
    expect(() => v.parse(settingsSchema, { imageTranslateSurface: 'inline' })).toThrow();
  });
});

describe('settingsSchema is the source of the defaults', () => {
  it('settingsSchema.parse({}) produces a fully-populated Settings', () => {
    const s = v.parse(settingsSchema, {});
    expect(s.theme).toBe('system');
    expect(s.defaultTask).toBe('translate');
    expect(s.defaultTone).toBe('neutral');
    expect(s.advanced.temperature).toBe(0.2);
    expect(s.advanced.maxTokens).toBe(2048);
    expect(s.backendOrder).toEqual([
      'anthropic',
      'openai',
      'gemini',
      'ollama',
      'localserver',
      'native',
      'groq',
      'deepseek',
      'together',
      'mistral',
      'xai',
      'fireworks',
      'openrouter',
    ]);
    expect(s.disabledBackends).toEqual([
      'openai',
      'groq',
      'deepseek',
      'together',
      'mistral',
      'xai',
      'fireworks',
      'openrouter',
      'ollama',
      'localserver',
    ]);
    expect(s.cacheEnabled).toBe(true);
    expect(s.captureResultMeta).toBe(true);
  });

  it('settingsSchema.parse({}) deep-equals DEFAULT_SETTINGS', () => {
    // DEFAULT_SETTINGS must equal the schema defaults, so a missing default fails here.
    expect(v.parse(settingsSchema, {})).toEqual(DEFAULT_SETTINGS);
  });

  it('bubbleFirstRunSeen defaults to false like its sibling flags', () => {
    expect(DEFAULT_SETTINGS.bubbleFirstRunSeen).toBe(false);
  });
});

describe('the local server backend settings', () => {
  it('sits right after ollama in the default order, off by default, with an empty model slot', () => {
    const order = DEFAULT_SETTINGS.backendOrder;
    expect(order.indexOf(asBackendIdUnsafe('localserver'))).toBe(
      order.indexOf(asBackendIdUnsafe('ollama')) + 1,
    );
    expect(DEFAULT_SETTINGS.disabledBackends).toContain('localserver');
    expect(DEFAULT_SETTINGS.model.localserver).toBe('');
    expect(DEFAULT_SETTINGS.localServerUrl).toBeUndefined();
  });

  it('fills the model slot for a stored map from an older build', () => {
    const { localserver: _drop, ...older } = DEFAULT_SETTINGS.model;
    expect(parseSettings({ ...DEFAULT_SETTINGS, model: older }).model.localserver).toBe('');
  });

  it('takes only loopback URLs, like ollamaUrl', () => {
    for (const raw of [
      '',
      'http://127.0.0.1:1234',
      'http://localhost:8080/v1',
      'http://[::1]:8080',
    ]) {
      expect(parseSettings({ ...DEFAULT_SETTINGS, localServerUrl: raw }).localServerUrl).toBe(raw);
    }
    for (const raw of ['http://192.168.1.10:1234', 'http://lmstudio.local:1234', 'file:///x']) {
      expect(() => parseSettings({ ...DEFAULT_SETTINGS, localServerUrl: raw })).toThrow(
        /localServerUrl must be http\(s\) pointing at localhost/,
      );
    }
  });
});

describe('ollamaUrl — DNS-rebinding guard (loopback only)', () => {
  const ok = (raw: string) => {
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, ollamaUrl: raw });
    expect(parsed.ollamaUrl).toBe(raw);
  };
  const rejects = (raw: string) => {
    expect(() => parseSettings({ ...DEFAULT_SETTINGS, ollamaUrl: raw })).toThrow();
  };

  it('accepts http://localhost:<port>', () => ok('http://localhost:11434'));
  it('accepts http://127.0.0.1:<port>', () => ok('http://127.0.0.1:11434'));
  it('accepts http://[::1]:<port>', () => ok('http://[::1]:11434'));
  it('accepts empty string (settings cleared)', () => ok(''));

  it('rejects private LAN 10.x', () => rejects('http://10.0.0.5:11434'));
  it('rejects private LAN 192.168.x', () => rejects('http://192.168.1.10:11434'));
  it('rejects private LAN 172.16-31.x', () => rejects('http://172.20.0.1:11434'));
  it('rejects *.local mDNS', () => rejects('http://ollama.local:11434'));
  it('rejects *.internal', () => rejects('http://ollama.internal:11434'));
  it('rejects public hostname (DNS-rebinding vector)', () =>
    rejects('http://attacker.example.com/'));
  it('rejects public IP', () => rejects('http://8.8.8.8:11434'));
  it('rejects non-http(s) protocols', () => rejects('file:///etc/passwd'));
  it('rejects strings over 256 chars', () => rejects(`http://localhost:11434/${'a'.repeat(260)}`));
});

describe('glossary', () => {
  it('defaults to empty array', () => {
    expect(DEFAULT_SETTINGS.glossary).toEqual([]);
  });

  it('accepts a minimal entry (term + translation)', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      glossary: [{ term: 'Foo', translation: 'Bar' }],
    });
    expect(parsed.glossary).toHaveLength(1);
    // schema fills caseSensitive default
    expect(parsed.glossary[0]?.caseSensitive).toBe(false);
  });

  it('rejects term > 100 chars', () => {
    expect(() =>
      parseSettings({
        ...DEFAULT_SETTINGS,
        glossary: [{ term: 'x'.repeat(101), translation: 'Bar' }],
      }),
    ).toThrow();
  });

  it('rejects translation > 100 chars', () => {
    expect(() =>
      parseSettings({
        ...DEFAULT_SETTINGS,
        glossary: [{ term: 'Foo', translation: 'y'.repeat(101) }],
      }),
    ).toThrow();
  });

  it('rejects empty term', () => {
    expect(() =>
      parseSettings({
        ...DEFAULT_SETTINGS,
        glossary: [{ term: '', translation: 'Bar' }],
      }),
    ).toThrow();
  });

  it('rejects an array > 200 entries', () => {
    const oversize = Array.from({ length: 201 }, (_, i) => ({
      term: `t${i}`,
      translation: `r${i}`,
    }));
    expect(() => parseSettings({ ...DEFAULT_SETTINGS, glossary: oversize })).toThrow();
  });
});
