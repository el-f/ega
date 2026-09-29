import { describe, it, expect } from 'vitest';
import {
  isOpenAIReasoningModel,
  resolveSamplingSupport,
  type SamplingSupport,
} from '@/shared/backends/sampling-caps';

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
    // These take temperature; classifying them as reasoning drops the user's setting.
    for (const id of [
      'gpt-5-chat-latest',
      'gpt-5-chat',
      'openai/gpt-5-chat-latest',
      'GPT-5-Chat',
    ]) {
      expect(isOpenAIReasoningModel(id), id).toBe(false);
    }
  });

  it('a chat-tuned gpt-5 keeps temperature and max_tokens', () => {
    expect(resolveSamplingSupport('openai', 'gpt-5-chat-latest')).toEqual({
      temperature: true,
      maxTokens: true,
      reasoningEffort: false,
    });
  });

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
  const sup = (t: boolean, m: boolean, r: boolean): SamplingSupport => ({
    temperature: t,
    maxTokens: m,
    reasoningEffort: r,
  });

  it('native supports nothing', () => {
    expect(resolveSamplingSupport('native', 'whatever')).toEqual(sup(false, false, false));
  });

  it('anthropic / gemini / ollama support temperature + maxTokens, no reasoning', () => {
    expect(resolveSamplingSupport('anthropic', 'claude-3-5-sonnet')).toEqual(
      sup(true, true, false),
    );
    expect(resolveSamplingSupport('gemini', 'gemini-1.5-pro')).toEqual(sup(true, true, false));
    expect(resolveSamplingSupport('ollama', 'llama3')).toEqual(sup(true, true, false));
  });

  it('openai chat model: base support', () => {
    expect(resolveSamplingSupport('openai', 'gpt-4o')).toEqual(sup(true, true, false));
    expect(resolveSamplingSupport('openai', 'gpt-4-turbo')).toEqual(sup(true, true, false));
  });

  it('openai reasoning model: no temperature, keeps maxTokens, gains reasoningEffort', () => {
    expect(resolveSamplingSupport('openai', 'o3-mini')).toEqual(sup(false, true, true));
    expect(resolveSamplingSupport('openai', 'gpt-5')).toEqual(sup(false, true, true));
    expect(resolveSamplingSupport('openai', 'o1')).toEqual(sup(false, true, true));
  });

  it('groq / deepseek base support even for a reasoning-shaped model (out of scope in v1)', () => {
    expect(resolveSamplingSupport('groq', 'o3-mini')).toEqual(sup(true, true, false));
    expect(resolveSamplingSupport('deepseek', 'gpt-5')).toEqual(sup(true, true, false));
    expect(resolveSamplingSupport('groq', 'llama3')).toEqual(sup(true, true, false));
  });

  it('unknown backend: conservative default (temperature + maxTokens, no reasoning)', () => {
    expect(resolveSamplingSupport('some-future-backend', 'whatever')).toEqual(
      sup(true, true, false),
    );
  });
});
