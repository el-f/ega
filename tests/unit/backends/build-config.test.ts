import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { buildBackendConfig } from '@/shared/backends/build-config';
import type { Settings } from '@/shared/types';

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('buildBackendConfig', () => {
  it('omits undefined api keys (exactOptionalPropertyTypes)', () => {
    const cfg = buildBackendConfig(settings());
    expect('anthropic' in cfg.apiKeys).toBe(false);
    expect('openai' in cfg.apiKeys).toBe(false);
    expect('gemini' in cfg.apiKeys).toBe(false);
    expect('groq' in cfg.apiKeys).toBe(false);
    expect('deepseek' in cfg.apiKeys).toBe(false);
  });

  it('threads present api keys through', () => {
    const cfg = buildBackendConfig(
      settings({
        anthropicApiKey: 'sk-a',
        openaiApiKey: 'sk-o',
        geminiApiKey: 'sk-g',
        groqApiKey: 'sk-q',
        deepseekApiKey: 'sk-d',
      }),
    );
    expect(cfg.apiKeys).toEqual({
      anthropic: 'sk-a',
      openai: 'sk-o',
      gemini: 'sk-g',
      groq: 'sk-q',
      deepseek: 'sk-d',
    });
  });

  it('threads the new OpenAI-compat provider keys through', () => {
    const cfg = buildBackendConfig(
      settings({
        togetherApiKey: 'tg',
        mistralApiKey: 'mi',
        xaiApiKey: 'xa',
        fireworksApiKey: 'fw',
        openrouterApiKey: 'or',
      }),
    );
    expect(cfg.apiKeys.together).toBe('tg');
    expect(cfg.apiKeys.mistral).toBe('mi');
    expect(cfg.apiKeys.xai).toBe('xa');
    expect(cfg.apiKeys.fireworks).toBe('fw');
    expect(cfg.apiKeys.openrouter).toBe('or');
  });

  it('omits ollamaUrl / nativeCli / localBackendTimeoutMs when absent', () => {
    const cfg = buildBackendConfig(settings({ ollamaUrl: undefined, nativeCli: undefined }));
    expect('ollamaUrl' in cfg).toBe(false);
    expect('nativeCli' in cfg).toBe(false);
    expect('localBackendTimeoutMs' in cfg).toBe(false);
  });

  it('never projects defaultTargetLang — no backend reads it', () => {
    const cfg = buildBackendConfig(settings());
    expect(settings().defaultTargetLang).toBeTruthy();
    expect('defaultTargetLang' in cfg).toBe(false);
  });

  it('threads localServerUrl when set and omits it when empty', () => {
    expect(
      buildBackendConfig(settings({ localServerUrl: 'http://127.0.0.1:8080' })).localServerUrl,
    ).toBe('http://127.0.0.1:8080');
    expect('localServerUrl' in buildBackendConfig(settings({ localServerUrl: '' }))).toBe(false);
  });

  it('threads ollamaUrl when set', () => {
    const cfg = buildBackendConfig(settings({ ollamaUrl: 'http://1.2.3.4:11434' }));
    expect(cfg.ollamaUrl).toBe('http://1.2.3.4:11434');
  });

  it('falls back to advanced.* when no task pin', () => {
    const s = settings();
    s.advanced.temperature = 0.4;
    s.advanced.maxTokens = 800;
    s.advanced.effort = 'high';
    const cfg = buildBackendConfig(s);
    expect(cfg.advanced.temperature).toBe(0.4);
    expect(cfg.advanced.maxTokens).toBe(800);
    expect(cfg.advanced.effort).toBe('high');
  });

  it('per-task effort overrides advanced.effort', () => {
    const s = settings();
    s.advanced.temperature = 0.4;
    s.advanced.maxTokens = 800;
    s.advanced.effort = 'low';
    s.taskOverrides = { reword: { effort: 'high' } };
    const cfg = buildBackendConfig(s, 'reword');
    expect(cfg.advanced.temperature).toBe(0.4);
    expect(cfg.advanced.maxTokens).toBe(800);
    expect(cfg.advanced.effort).toBe('high');
  });

  it('without task arg, per-task pins are ignored', () => {
    const s = settings();
    s.advanced.effort = 'low';
    s.taskOverrides = { reword: { effort: 'high' } };
    const cfg = buildBackendConfig(s);
    expect(cfg.advanced.effort).toBe('low');
  });

  it('threads model map verbatim', () => {
    const s = settings();
    const cfg = buildBackendConfig(s);
    expect(cfg.model).toBe(s.model);
  });
});
