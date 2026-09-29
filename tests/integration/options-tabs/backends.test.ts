import { describe, it, expect, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { getSettings, updateSettings } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

const bid = (s: string) => asBackendIdUnsafe(s);

describe('Backends tab — round-trip persistence', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  /** Mirrors Backends.svelte's toggleEnabled. */
  async function toggleEnabled(id: string, enabled: boolean): Promise<Settings> {
    const s = await getSettings();
    const current = new Set(s.disabledBackends);
    const branded = bid(id);
    if (enabled) current.delete(branded);
    else current.add(branded);
    const next = Array.from(current);
    return updateSettings(next.length > 0 ? { disabledBackends: next } : { disabledBackends: [] });
  }

  it('toggle backend off → disabledBackends contains id on re-read', async () => {
    await toggleEnabled('anthropic', false);
    const s = await getSettings();
    expect(s.disabledBackends).toContain('anthropic');
  });

  it('toggle backend on → id removed from disabledBackends', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: {
        schemaVersion: 4,
        disabledBackends: ['anthropic'],
      },
    });
    await toggleEnabled('anthropic', true);
    const s = await getSettings();
    expect(s.disabledBackends).not.toContain('anthropic');
  });

  it('enable all (clear disabledBackends to []) → round-trip sees empty array, not missing', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: {
        schemaVersion: 4,
        disabledBackends: ['openai'],
      },
    });
    await toggleEnabled('openai', true);
    const s = await getSettings();
    // The sanitizer keeps an empty disabledBackends array on output instead of dropping the key.
    expect(s.disabledBackends).toEqual([]);
  });

  it('backendOrder reorder persists', async () => {
    await updateSettings({
      backendOrder: ['anthropic', 'openai', 'native', 'gemini', 'groq', 'deepseek', 'ollama'].map(
        bid,
      ),
    });
    let s = await getSettings();
    expect(s.backendOrder[0]).toBe('anthropic');
    expect(s.backendOrder[1]).toBe('openai');

    const order = [...s.backendOrder];
    const a = order[0];
    const b = order[1];
    if (a === undefined || b === undefined) throw new Error('test setup: order too short');
    order[0] = b;
    order[1] = a;
    await updateSettings({ backendOrder: order });
    s = await getSettings();
    expect(s.backendOrder[0]).toBe('openai');
    expect(s.backendOrder[1]).toBe('anthropic');
  });

  it('backendOrder write + partial override round-trip', async () => {
    await updateSettings({
      backendOrder: ['anthropic', 'openai', 'gemini', 'groq', 'deepseek', 'ollama', 'native'].map(
        bid,
      ),
    });
    let s = await getSettings();
    expect(s.backendOrder[0]).toBe('anthropic');

    const [first, ...rest] = s.backendOrder;
    if (first === undefined) throw new Error('test setup: backendOrder empty');
    const next = [...rest, first];
    await updateSettings({ backendOrder: next });
    s = await getSettings();
    expect(s.backendOrder[0]).toBe('openai');
    expect(s.backendOrder[s.backendOrder.length - 1]).toBe('anthropic');
  });

  it('API key round-trip: write, read, clear', async () => {
    await updateSettings({ anthropicApiKey: 'sk-ant-test' });
    let s = await getSettings();
    expect(s.anthropicApiKey).toBe('sk-ant-test');

    await updateSettings({ anthropicApiKey: '' });
    s = await getSettings();
    expect(s.anthropicApiKey).toBe('');
  });

  it('model-field round-trip', async () => {
    await updateSettings({ model: { ...(await getSettings()).model, anthropic: 'claude-opus-4' } });
    const s = await getSettings();
    expect(s.model.anthropic).toBe('claude-opus-4');
    // Deep merge keeps the other model fields.
    expect(s.model.openai).toBeDefined();
  });

  it('backendOrder round-trips a reorder', async () => {
    await updateSettings({
      backendOrder: ['gemini', 'anthropic', 'openai', 'groq', 'deepseek', 'ollama', 'native'].map(
        bid,
      ),
      disabledBackends: [],
    });
    const s = await getSettings();
    expect(s.backendOrder[0]).toBe('gemini');
  });

  it('toggling one backend keeps the other disabled ids', async () => {
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: {
        schemaVersion: 4,
        disabledBackends: ['openai', 'gemini'],
      },
    });
    await toggleEnabled('groq', false);
    const s = await getSettings();
    const disabled = s.disabledBackends;
    expect(disabled).toContain('openai');
    expect(disabled).toContain('gemini');
    expect(disabled).toContain('groq');
  });
});
