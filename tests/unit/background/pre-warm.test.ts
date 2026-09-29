import { describe, it, expect } from 'vitest';
import { resolvePreWarmProvider } from '@/background/pre-warm';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { Settings } from '@/shared/types';

function settings(overrides: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides } as Settings;
}

describe('resolvePreWarmProvider', () => {
  it('returns null when the active backend is not native', () => {
    const s = settings({
      preWarmNative: true,
      nativeCli: 'claude',
    });
    expect(resolvePreWarmProvider(s)).toBeNull();
  });

  it('returns nativeCli when the active backend is native and preWarm is on', () => {
    const s = settings({
      backendOrder: [asBackendIdUnsafe('native'), asBackendIdUnsafe('anthropic')],
      disabledBackends: [],
      preWarmNative: true,
      nativeCli: 'claude',
    });
    expect(resolvePreWarmProvider(s)).toBe('claude');
  });

  it('returns nativeCli when translate is pinned to native below the head of backendOrder', () => {
    const s = settings({
      backendOrder: [asBackendIdUnsafe('anthropic'), asBackendIdUnsafe('native')],
      disabledBackends: [],
      taskBackends: { translate: asBackendIdUnsafe('native') },
      preWarmNative: true,
      nativeCli: 'claude',
    });
    expect(resolvePreWarmProvider(s)).toBe('claude');
  });

  it('returns nativeCli when the translate chain puts native first', () => {
    const base = settings({
      backendOrder: [asBackendIdUnsafe('anthropic'), asBackendIdUnsafe('native')],
      disabledBackends: [],
      preWarmNative: true,
      nativeCli: 'claude',
    });
    const s: Settings = {
      ...base,
      advanced: {
        ...base.advanced,
        taskBackendChains: { translate: [asBackendIdUnsafe('native')] },
      },
    };
    expect(resolvePreWarmProvider(s)).toBe('claude');
  });

  it('returns null when preWarmNative is explicitly false', () => {
    const s = settings({
      preWarmNative: false,
      nativeCli: 'claude',
    });
    expect(resolvePreWarmProvider(s)).toBeNull();
  });

  it('honors codex as the active CLI pick', () => {
    const s = settings({
      backendOrder: [asBackendIdUnsafe('native'), asBackendIdUnsafe('anthropic')],
      disabledBackends: [],
      preWarmNative: true,
      nativeCli: 'codex',
    });
    expect(resolvePreWarmProvider(s)).toBe('codex');
  });

  it('falls back to the default native CLI when nativeCli is unset', () => {
    const base = settings({
      backendOrder: [asBackendIdUnsafe('native'), asBackendIdUnsafe('anthropic')],
      disabledBackends: [],
      preWarmNative: true,
    });
    // Strip nativeCli without violating the discriminated union shape.
    const s = { ...base } as Partial<Settings> & { nativeCli?: string };
    delete s.nativeCli;
    expect(resolvePreWarmProvider(s as Settings)).toBe('claude');
  });

  it('resolves the active backend via backendOrder when backend === "auto"', () => {
    const s = settings({
      backendOrder: [
        asBackendIdUnsafe('native'),
        asBackendIdUnsafe('anthropic'),
        asBackendIdUnsafe('openai'),
        asBackendIdUnsafe('gemini'),
        asBackendIdUnsafe('groq'),
        asBackendIdUnsafe('deepseek'),
        asBackendIdUnsafe('ollama'),
      ],
      disabledBackends: [],
      preWarmNative: true,
      nativeCli: 'claude',
    });
    expect(resolvePreWarmProvider(s)).toBe('claude');
  });

  it('returns null under "auto" when native is disabled', () => {
    const s = settings({
      backendOrder: [
        asBackendIdUnsafe('native'),
        asBackendIdUnsafe('anthropic'),
        asBackendIdUnsafe('openai'),
        asBackendIdUnsafe('gemini'),
        asBackendIdUnsafe('groq'),
        asBackendIdUnsafe('deepseek'),
        asBackendIdUnsafe('ollama'),
      ],
      disabledBackends: [asBackendIdUnsafe('native')],
      preWarmNative: true,
      nativeCli: 'claude',
    });
    expect(resolvePreWarmProvider(s)).toBeNull();
  });

  it('defaults preWarmNative=true when not explicitly set — DEFAULT_SETTINGS treats it as on', () => {
    // Sanity: schema default must surface as truthy.
    expect(DEFAULT_SETTINGS.preWarmNative).toBe(true);
  });
});
