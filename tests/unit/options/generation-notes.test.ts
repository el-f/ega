import { describe, it, expect } from 'vitest';
import { generationNotes } from '@/options/generation-notes';
import type { SamplingSupport } from '@/shared/backends/sampling-caps';

const NATIVE: SamplingSupport = { temperature: false, maxTokens: false, efforts: [] };
const CLASSIC: SamplingSupport = { temperature: true, maxTokens: true, efforts: [] };
const REASONING: SamplingSupport = {
  temperature: false,
  maxTokens: true,
  efforts: ['low', 'medium', 'high'],
};
const FULL: SamplingSupport = {
  temperature: true,
  maxTokens: true,
  efforts: ['off', 'low', 'medium', 'high'],
};

const caps =
  (table: Record<string, SamplingSupport>) =>
  (id: string): SamplingSupport =>
    table[id] ?? FULL;

describe('generationNotes', () => {
  it('says nothing when every backend tried takes every value', () => {
    expect(generationNotes('medium', ['anthropic', 'gemini'], caps({}))).toEqual({
      effort: [],
      maxTokens: [],
      temperature: [],
    });
  });

  it('only backends that are tried count: a native host outside the tried set adds nothing', () => {
    expect(generationNotes('high', ['anthropic'], caps({ native: NATIVE }))).toEqual({
      effort: [],
      maxTokens: [],
      temperature: [],
    });
    expect(generationNotes('high', ['native'], caps({ native: NATIVE }))).toEqual({
      effort: ['The native host always runs at Low'],
      maxTokens: ['The native host ignores this'],
      temperature: ['The native host ignores this'],
    });
  });

  it('the native host at Low already says what it does, so no Effort note', () => {
    expect(generationNotes('low', ['native'], caps({ native: NATIVE })).effort).toEqual([]);
  });

  it('a level the model lacks names the level it runs at, by backend name, never the model id', () => {
    expect(generationNotes('off', ['openai'], caps({ openai: REASONING })).effort).toEqual([
      'OpenAI has no Off, so it runs at Low',
    ]);
  });

  it('a model with no levels ignores Effort, said only when Effort is above Off', () => {
    expect(generationNotes('off', ['openai'], caps({ openai: CLASSIC })).effort).toEqual([]);
    expect(generationNotes('high', ['openai'], caps({ openai: CLASSIC })).effort).toEqual([
      'OpenAI ignores Effort',
    ]);
  });

  it('joins the backends that ignore one control into one line', () => {
    const notes = generationNotes(
      'high',
      ['native', 'openai', 'groq'],
      caps({ native: NATIVE, openai: REASONING, groq: REASONING }),
    );
    expect(notes.temperature).toEqual(['The native host, OpenAI and Groq ignore this']);
    expect(notes.maxTokens).toEqual(['The native host ignores this']);
  });
});
