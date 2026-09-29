import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import {
  resolveActiveBackendId,
  resolveTaskMaxTokens,
  resolveTaskReasoningEffort,
  resolveTaskTemperature,
} from '@/shared/backend-params';
import type { Settings } from '@/shared/types';

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('resolveTaskReasoningEffort', () => {
  it('defaults to advanced.reasoningEffort when no task pin', () => {
    const s = settings();
    expect(resolveTaskReasoningEffort(s)).toBe('medium');
  });

  it('falls back to advanced.reasoningEffort for an unpinned task', () => {
    const s = settings();
    s.advanced.reasoningEffort = 'high';
    expect(resolveTaskReasoningEffort(s, 'translate')).toBe('high');
  });

  it('per-task pin beats the global value', () => {
    const s = settings();
    s.advanced.reasoningEffort = 'low';
    s.taskReasoningEfforts = { reword: 'high' };
    expect(resolveTaskReasoningEffort(s, 'reword')).toBe('high');
  });

  it('per-task pin is scope-isolated — one task pin does not affect another', () => {
    const s = settings();
    s.advanced.reasoningEffort = 'low';
    s.taskReasoningEfforts = { reword: 'high' };
    expect(resolveTaskReasoningEffort(s, 'summarize')).toBe('low');
  });

  it('without a task arg, per-task pins are ignored', () => {
    const s = settings();
    s.advanced.reasoningEffort = 'low';
    s.taskReasoningEfforts = { reword: 'high' };
    expect(resolveTaskReasoningEffort(s)).toBe('low');
  });
});

describe('resolveActiveBackendId', () => {
  it('selects the first backend in backendOrder', () => {
    const s = settings({
      backendOrder: ['openai', 'anthropic'] as Settings['backendOrder'],
      disabledBackends: [] as unknown as Settings['disabledBackends'],
    });
    expect(resolveActiveBackendId(s)).toBe('openai');
  });

  it('selects first non-disabled backend from backendOrder', () => {
    const s = settings({
      backendOrder: ['anthropic', 'openai'] as Settings['backendOrder'],
      disabledBackends: ['anthropic'] as Settings['disabledBackends'],
    });
    expect(resolveActiveBackendId(s)).toBe('openai');
  });

  it('falls back to anthropic when every backend is disabled', () => {
    const s = settings({
      backendOrder: ['openai', 'gemini'] as Settings['backendOrder'],
      disabledBackends: ['openai', 'gemini'] as Settings['disabledBackends'],
    });
    expect(resolveActiveBackendId(s)).toBe('anthropic');
  });
});

describe('resolveTaskTemperature', () => {
  it('no task arg returns advanced.temperature', () => {
    const s = settings();
    expect(resolveTaskTemperature(s)).toBe(s.advanced.temperature);
  });

  it('per-task pin beats global temperature', () => {
    const s = settings();
    s.taskTemperatures = { reword: 0.9 };
    expect(resolveTaskTemperature(s, 'reword')).toBe(0.9);
  });

  it('task with no pin falls back to global temperature', () => {
    const s = settings();
    s.advanced.temperature = 0.7;
    s.taskTemperatures = { reword: 0.9 };
    expect(resolveTaskTemperature(s, 'translate')).toBe(0.7);
  });

  it('per-task pin is scope-isolated across tasks', () => {
    const s = settings();
    s.taskTemperatures = { reword: 0.9 };
    expect(resolveTaskTemperature(s, 'summarize')).toBe(s.advanced.temperature);
  });
});

describe('resolveTaskMaxTokens', () => {
  it('no task arg returns advanced.maxTokens', () => {
    const s = settings();
    expect(resolveTaskMaxTokens(s)).toBe(s.advanced.maxTokens);
  });

  it('per-task pin beats global maxTokens', () => {
    const s = settings();
    s.taskMaxTokens = { translate: 512 };
    expect(resolveTaskMaxTokens(s, 'translate')).toBe(512);
  });

  it('task with no pin falls back to global maxTokens', () => {
    const s = settings();
    s.taskMaxTokens = { translate: 512 };
    expect(resolveTaskMaxTokens(s, 'reword')).toBe(s.advanced.maxTokens);
  });
});
