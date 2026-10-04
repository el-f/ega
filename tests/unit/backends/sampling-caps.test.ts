import { describe, it, expect } from 'vitest';
import {
  clampEffort,
  isOpenAIReasoningModel,
  resolveEffort,
  resolveSamplingSupport,
  withReasoningHeadroom,
  type SamplingSupport,
} from '@/shared/backends/sampling-caps';
import { DEFAULT_MODEL } from '@/shared/settings-defaults';

const ALL = ['off', 'low', 'medium', 'high'] as const;
const FROM_LOW = ['low', 'medium', 'high'] as const;

describe('isOpenAIReasoningModel', () => {
  it('matches the o-series families', () => {
    for (const id of ['o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini', 'o4-mini']) {
      expect(isOpenAIReasoningModel(id)).toBe(true);
    }
  });

  it('matches the gpt-5 family', () => {
    for (const id of ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-2025-08-07']) {
      expect(isOpenAIReasoningModel(id)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isOpenAIReasoningModel('O3-MINI')).toBe(true);
    expect(isOpenAIReasoningModel('GPT-5')).toBe(true);
  });

  it('does NOT match the chat-tuned gpt-5 variants', () => {
    // Chat-tuned siblings, not reasoning models.
    for (const id of [
      'gpt-5-chat-latest',
      'gpt-5-chat',
      'openai/gpt-5-chat-latest',
      'GPT-5-Chat',
    ]) {
      expect(isOpenAIReasoningModel(id), id).toBe(false);
    }
  });

  it('a chat-latest alias gets neither temperature nor effort', () => {
    expect(resolveSamplingSupport('openai', 'gpt-5-chat-latest')).toEqual({
      temperature: false,
      maxTokens: true,
      efforts: [],
    });
  });

  it.each([
    'claude-haiku-4-5',
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-opus-4-1-20250805',
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-latest',
  ])('Claude %s still takes temperature', (id) => {
    expect(resolveSamplingSupport('anthropic', id).temperature).toBe(true);
  });

  it.each([
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-opus-5',
    'claude-opus-5-5',
    'claude-sonnet-5',
    'claude-sonnet-5-5',
    'claude-fable-5',
    'claude-fable-5-1',
    'claude-mythos-5',
    'claude-mythos-5-1',
    'claude-mythos-preview',
  ])('Claude %s rejects temperature and takes effort from low', (id) => {
    expect(resolveSamplingSupport('anthropic', id)).toEqual({
      temperature: false,
      maxTokens: true,
      efforts: FROM_LOW,
    });
  });

  it.each(['claude-opus-4-5', 'claude-opus-4-5-20251101', 'claude-opus-4-6', 'claude-sonnet-4-6'])(
    'Claude %s takes both temperature and effort',
    (id) => {
      expect(resolveSamplingSupport('anthropic', id)).toEqual({
        temperature: true,
        maxTokens: true,
        efforts: FROM_LOW,
      });
    },
  );

  it.each([
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5',
    'claude-sonnet-4-5-20250929',
    'claude-opus-4-1-20250805',
    'claude-3-7-sonnet-latest',
    'claude-haiku-5-5',
  ])(
    'Claude %s gets no effort (Haiku 4.5 answers 400; an unknown id is safer without it)',
    (id) => {
      expect(resolveSamplingSupport('anthropic', id).efforts).toEqual([]);
    },
  );

  it('tolerates provider prefixes', () => {
    expect(isOpenAIReasoningModel('openai/o3-mini')).toBe(true);
    expect(isOpenAIReasoningModel('openai/gpt-5')).toBe(true);
  });

  it('tolerates date suffixes', () => {
    expect(isOpenAIReasoningModel('o3-mini-2025-01-31')).toBe(true);
    expect(isOpenAIReasoningModel('o1-2024-12-17')).toBe(true);
  });

  it('does NOT match gpt-4o (the 4o false-positive guard)', () => {
    expect(isOpenAIReasoningModel('gpt-4o')).toBe(false);
    expect(isOpenAIReasoningModel('gpt-4o-mini')).toBe(false);
    expect(isOpenAIReasoningModel('openai/gpt-4o')).toBe(false);
    expect(isOpenAIReasoningModel('gpt-4o-2024-08-06')).toBe(false);
  });

  it('does NOT match classic chat / other models', () => {
    for (const id of [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'claude-3-5-sonnet',
      'gemini-1.5-pro',
      '',
    ]) {
      expect(isOpenAIReasoningModel(id)).toBe(false);
    }
  });

  it('does NOT match gpt-4o1 / words that merely contain o1', () => {
    expect(isOpenAIReasoningModel('gpt-4o1')).toBe(false);
    expect(isOpenAIReasoningModel('echo1')).toBe(false);
    expect(isOpenAIReasoningModel('foo3')).toBe(false);
  });
});

describe('resolveSamplingSupport', () => {
  const sup = (t: boolean, m: boolean, efforts: readonly string[] = []): SamplingSupport =>
    ({ temperature: t, maxTokens: m, efforts }) as SamplingSupport;

  it.each(Object.keys(DEFAULT_MODEL))(
    'an empty %s slot gets the caps of the model it runs as',
    (id) => {
      const runsAs = DEFAULT_MODEL[id as keyof typeof DEFAULT_MODEL];
      expect(resolveSamplingSupport(id, '')).toEqual(resolveSamplingSupport(id, runsAs));
      expect(resolveSamplingSupport(id, '  ')).toEqual(resolveSamplingSupport(id, runsAs));
    },
  );

  it('an empty Groq or Fireworks slot runs gpt-oss, so it takes Low to High', () => {
    expect(resolveSamplingSupport('groq', '').efforts).toEqual(FROM_LOW);
    expect(resolveSamplingSupport('fireworks', '').efforts).toEqual(FROM_LOW);
  });

  it('native supports nothing: the host runs the CLI at a fixed low effort', () => {
    expect(resolveSamplingSupport('native', 'whatever')).toEqual(sup(false, false));
  });

  it('old Claude, Gemini 1.x/2.x and Ollama take temperature and no effort', () => {
    expect(resolveSamplingSupport('anthropic', 'claude-3-5-sonnet')).toEqual(sup(true, true));
    expect(resolveSamplingSupport('gemini', 'gemini-1.5-pro')).toEqual(sup(true, true));
    expect(resolveSamplingSupport('gemini', 'gemini-2.5-flash')).toEqual(sup(true, true));
    expect(resolveSamplingSupport('ollama', 'llama3')).toEqual(sup(true, true));
  });

  it('gemini 3.x drops temperature; the -latest aliases take no level', () => {
    expect(resolveSamplingSupport('gemini', 'gemini-3.5-flash-lite')).toEqual(
      sup(false, true, ALL),
    );
    expect(resolveSamplingSupport('gemini', 'gemini-3.8-flash')).toEqual(
      sup(false, true, FROM_LOW),
    );
    expect(resolveSamplingSupport('gemini', 'gemini-flash-latest')).toEqual(sup(false, true));
    expect(resolveSamplingSupport('gemini', '')).toEqual(sup(false, true, ALL));
  });

  it('openai chat model: base support', () => {
    expect(resolveSamplingSupport('openai', 'gpt-4o')).toEqual(sup(true, true));
    expect(resolveSamplingSupport('openai', 'gpt-4-turbo')).toEqual(sup(true, true));
  });

  it('openai reasoning models: no temperature; Off only where the model has none or minimal', () => {
    expect(resolveSamplingSupport('openai', 'o3-mini')).toEqual(sup(false, true, FROM_LOW));
    expect(resolveSamplingSupport('openai', 'gpt-6-astra')).toEqual(sup(false, true, FROM_LOW));
    expect(resolveSamplingSupport('openai', 'gpt-6.1-sol')).toEqual(sup(false, true, FROM_LOW));
    for (const id of ['gpt-5', 'gpt-5-mini-2025-08-07', 'gpt-5.1', 'gpt-6-luna', 'gpt-6-sol']) {
      expect(resolveSamplingSupport('openai', id), id).toEqual(sup(false, true, ALL));
    }
  });

  it('openrouter takes every level; xai only from grok-4.3', () => {
    expect(resolveSamplingSupport('openrouter', 'openai/gpt-4o-mini').efforts).toEqual(ALL);
    expect(resolveSamplingSupport('xai', 'grok-4.3').efforts).toEqual(ALL);
    expect(resolveSamplingSupport('xai', 'grok-4').efforts).toEqual([]);
  });

  it('groq / deepseek base support even for a reasoning-shaped model', () => {
    expect(resolveSamplingSupport('groq', 'o3-mini')).toEqual(sup(true, true));
    expect(resolveSamplingSupport('deepseek', 'gpt-5')).toEqual(sup(true, true));
    expect(resolveSamplingSupport('deepseek', 'deepseek-flash')).toEqual(sup(true, true));
  });

  it('unknown backend: conservative default (temperature + maxTokens, no effort)', () => {
    expect(resolveSamplingSupport('some-future-backend', 'whatever')).toEqual(sup(true, true));
  });
});

describe('clampEffort', () => {
  it('keeps an allowed level and moves to the nearest one otherwise, ties going up', () => {
    expect(clampEffort('medium', ALL)).toBe('medium');
    expect(clampEffort('off', FROM_LOW)).toBe('low');
    expect(clampEffort('medium', ['off', 'high'])).toBe('high');
    expect(clampEffort('low', ['off', 'high'])).toBe('off');
    expect(clampEffort('high', [])).toBeNull();
  });
});

describe('resolveEffort maps the one scale to each backend', () => {
  it.each([
    ['anthropic', 'claude-sonnet-5-5', 'off', 'low', 'low'],
    ['anthropic', 'claude-sonnet-5-5', 'high', 'high', 'high'],
    ['openai', 'gpt-6-luna', 'off', 'off', 'none'],
    ['openai', 'gpt-5', 'off', 'off', 'minimal'],
    ['openai', 'gpt-6-astra', 'off', 'low', 'low'],
    ['openai', 'o3-mini', 'medium', 'medium', 'medium'],
    ['xai', 'grok-4.3', 'off', 'off', 'none'],
    ['groq', 'openai/gpt-oss-120b', 'off', 'low', 'low'],
    ['gemini', 'gemini-3.5-flash-lite', 'off', 'off', 'MINIMAL'],
    ['gemini', 'gemini-3.8-flash', 'off', 'low', 'LOW'],
    ['gemini', 'gemini-3.8-flash', 'high', 'high', 'HIGH'],
  ] as const)('%s %s: %s runs as %s and sends %s', (backend, model, asked, level, wire) => {
    expect(resolveEffort(backend, model, asked)).toEqual({ level, wire });
  });

  it('openrouter sends nothing for Off, so the model keeps its own default', () => {
    expect(resolveEffort('openrouter', 'openai/gpt-4o-mini', 'off')).toEqual({
      level: 'off',
      wire: null,
    });
  });

  it('a model with no effort setting gets nothing', () => {
    expect(resolveEffort('anthropic', 'claude-haiku-4-5-20251001', 'high')).toBeNull();
    expect(resolveEffort('ollama', 'gemma4:e4b', 'high')).toBeNull();
    expect(resolveEffort('native', '', 'high')).toBeNull();
  });
});

describe('withReasoningHeadroom', () => {
  it('adds room for thinking on top of the answer length, none when nothing thinks', () => {
    expect(withReasoningHeadroom(2048, null)).toBe(2048);
    expect(withReasoningHeadroom(2048, { level: 'off', wire: 'none' })).toBe(2048);
    expect(withReasoningHeadroom(2048, { level: 'low', wire: 'low' })).toBe(4096);
    expect(withReasoningHeadroom(2048, { level: 'high', wire: 'high' })).toBe(10240);
  });
});
