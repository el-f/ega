import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resolveActiveBackendId, resolveTaskEffort } from '@/shared/backend-params';
import type { Settings } from '@/shared/types';

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, advanced: { ...DEFAULT_SETTINGS.advanced }, ...patch };
}

describe('resolveTaskEffort', () => {
  it('defaults to advanced.effort when no task pin', () => {
    const s = settings();
    expect(resolveTaskEffort(s)).toBe('off');
  });

  it('falls back to advanced.effort for an unpinned task', () => {
    const s = settings();
    s.advanced.effort = 'high';
    expect(resolveTaskEffort(s, 'translate')).toBe('high');
  });

  it('per-task pin beats the global value', () => {
    const s = settings();
    s.advanced.effort = 'low';
    s.taskOverrides = { reword: { effort: 'high' } };
    expect(resolveTaskEffort(s, 'reword')).toBe('high');
  });

  it('per-task pin is scope-isolated — one task pin does not affect another', () => {
    const s = settings();
    s.advanced.effort = 'low';
    s.taskOverrides = { reword: { effort: 'high' } };
    expect(resolveTaskEffort(s, 'summarize')).toBe('low');
  });

  it('Explain and Ask run at least at their shipped Low; a higher global level raises them', () => {
    const s = settings();
    expect(resolveTaskEffort(s, 'explain')).toBe('low');
    expect(resolveTaskEffort(s, 'ask')).toBe('low');
    expect(resolveTaskEffort(s, 'summarize')).toBe('off');
    s.advanced.effort = 'high';
    expect(resolveTaskEffort(s, 'explain')).toBe('high');
    expect(resolveTaskEffort(s, 'ask')).toBe('high');
  });

  it('a task pin wins in both directions, even a pin equal to the shipped level', () => {
    const s = settings();
    s.advanced.effort = 'high';
    s.taskOverrides = { explain: { effort: 'low' }, ask: { effort: 'off' } };
    expect(resolveTaskEffort(s, 'explain')).toBe('low');
    expect(resolveTaskEffort(s, 'ask')).toBe('off');
  });

  it('without a task arg, per-task pins are ignored', () => {
    const s = settings();
    s.advanced.effort = 'low';
    s.taskOverrides = { reword: { effort: 'high' } };
    expect(resolveTaskEffort(s)).toBe('low');
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

  it('skips a cloud backend with no key, so the head is the backend that will answer', () => {
    const s = settings({
      backendOrder: ['anthropic', 'gemini', 'native'] as Settings['backendOrder'],
      disabledBackends: [] as unknown as Settings['disabledBackends'],
      geminiApiKey: 'g-key',
    });
    expect(resolveActiveBackendId(s)).toBe('gemini');
    expect(resolveActiveBackendId({ ...s, geminiApiKey: '' })).toBe('native');
  });

  it('keeps the head of the chain when no backend can run yet', () => {
    const s = settings({
      backendOrder: ['anthropic', 'gemini'] as Settings['backendOrder'],
      disabledBackends: [] as unknown as Settings['disabledBackends'],
    });
    expect(resolveActiveBackendId(s)).toBe('anthropic');
  });

  it('falls back to anthropic when every backend is disabled', () => {
    const s = settings({
      backendOrder: ['openai', 'gemini'] as Settings['backendOrder'],
      disabledBackends: ['openai', 'gemini'] as Settings['disabledBackends'],
    });
    expect(resolveActiveBackendId(s)).toBe('anthropic');
  });
});
