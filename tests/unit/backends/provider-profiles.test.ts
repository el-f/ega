import { describe, it, expect } from 'vitest';
import {
  allProfiles,
  CLOUD_PROFILES,
  getCloudProfile,
  getProfile,
  profileApiKey,
  profileModel,
  type OpenAICompatProfile,
} from '@/shared/backends/provider-profiles';
import type { BackendConfig } from '@/shared/backends/base';
import { CLOUD_PROVIDER_IDS } from '@/shared/provider-ids';
import { DEFAULT_MODEL, parseSettings } from '@/shared/settings-schema';
import { getRegisteredBackendIds } from '@/shared/backends/registry';

const cfg: BackendConfig = {
  apiKeys: { openai: 'sk-test', groq: 'gsk-test' },
  model: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.5-flash',
    groq: '',
    deepseek: 'deepseek-chat',
    together: '',
    mistral: '',
    xai: '',
    fireworks: '',
    openrouter: '',
    ollama: 'llama3.2',
    native: '',
  },
  advanced: {
    promptTemplate: { system: 's', user: 'u' },
    perPresetTemplates: {},
    temperature: 0.2,
    maxTokens: 1024,
  },
};

describe('provider-profiles', () => {
  it('ships the three bundled OpenAI-compatible providers', () => {
    const ids = allProfiles().map((p) => p.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('groq');
    expect(ids).toContain('deepseek');
  });

  it.each([
    ['together', 'https://api.together.xyz/v1/chat/completions'],
    ['mistral', 'https://api.mistral.ai/v1/chat/completions'],
    ['xai', 'https://api.x.ai/v1/chat/completions'],
    ['fireworks', 'https://api.fireworks.ai/inference/v1/chat/completions'],
    ['openrouter', 'https://openrouter.ai/api/v1/chat/completions'],
  ])('bundles %s with the correct chat-completions baseUrl', (id, baseUrl) => {
    const p = getProfile(id);
    expect(p).not.toBeNull();
    expect(p?.baseUrl).toBe(baseUrl);
  });

  it('each bundled profile has a non-empty defaultModel and models endpoint', () => {
    for (const p of allProfiles()) {
      expect(p.defaultModel.length).toBeGreaterThan(0);
      expect(p.modelsUrl.length).toBeGreaterThan(0);
    }
  });

  // Every surface (card, chip, schema, key presence) derives from the profile, so one thin entry breaks all of them.
  it('every cloud provider id has a profile carrying every field the UI needs', () => {
    expect(CLOUD_PROFILES.map((p) => p.id)).toEqual([...CLOUD_PROVIDER_IDS]);
    for (const id of CLOUD_PROVIDER_IDS) {
      const p = getCloudProfile(id);
      expect(p.label.trim().length, `${id} label`).toBeGreaterThan(0);
      expect(p.signupUrl, `${id} signupUrl`).toMatch(/^https:\/\//);
      expect(p.keyPlaceholder.trim().length, `${id} keyPlaceholder`).toBeGreaterThan(0);
      expect(p.defaultModel.trim().length, `${id} defaultModel`).toBeGreaterThan(0);
      expect(DEFAULT_MODEL[id]).toBe(p.defaultModel);
      expect(getRegisteredBackendIds()).toContain(id);
    }
    const parsed = parseSettings({});
    for (const id of CLOUD_PROVIDER_IDS) {
      expect(parsed.model[id]).toBe(getCloudProfile(id).defaultModel);
      expect(`${id}ApiKey` in parseSettings({ [`${id}ApiKey`]: 'k' })).toBe(true);
    }
  });

  // The label is the card heading, the active chip and the first word of every error sentence.
  it('pins the label each provider shows the user', () => {
    expect(Object.fromEntries(CLOUD_PROFILES.map((p) => [p.id, p.label]))).toEqual({
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      gemini: 'Gemini',
      groq: 'Groq',
      deepseek: 'DeepSeek',
      together: 'Together',
      mistral: 'Mistral',
      xai: 'xAI',
      fireworks: 'Fireworks',
      openrouter: 'OpenRouter',
    });
  });

  it('the new providers read their own dedicated key + model slots', () => {
    const richCfg: BackendConfig = {
      ...cfg,
      apiKeys: {
        ...cfg.apiKeys,
        together: 'tg-key',
        mistral: 'mi-key',
        xai: 'xai-key',
        fireworks: 'fw-key',
        openrouter: 'or-key',
      },
    };
    expect(profileApiKey(getProfile('together') as OpenAICompatProfile, richCfg)).toBe('tg-key');
    expect(profileApiKey(getProfile('mistral') as OpenAICompatProfile, richCfg)).toBe('mi-key');
    expect(profileApiKey(getProfile('xai') as OpenAICompatProfile, richCfg)).toBe('xai-key');
    expect(profileApiKey(getProfile('fireworks') as OpenAICompatProfile, richCfg)).toBe('fw-key');
    expect(profileApiKey(getProfile('openrouter') as OpenAICompatProfile, richCfg)).toBe('or-key');
  });

  it('getProfile returns null for unknown ids', () => {
    expect(getProfile('made-up')).toBeNull();
  });

  it('profileModel falls back to the profile default when the slot is empty', () => {
    const groq = getProfile('groq');
    expect(groq).not.toBeNull();
    if (!groq) throw new Error('groq profile missing');
    // cfg.model.groq === '' → default
    expect(profileModel(groq, cfg)).toBe('llama-3.3-70b-versatile');
  });

  it('profileModel honors a configured slot', () => {
    const openai = getProfile('openai');
    if (!openai) throw new Error('openai profile missing');
    expect(profileModel(openai, cfg)).toBe('gpt-4o-mini');
  });

  it('profileApiKey reads the declared slot', () => {
    const openai = getProfile('openai');
    if (!openai) throw new Error('openai profile missing');
    expect(profileApiKey(openai, cfg)).toBe('sk-test');
    expect(profileApiKey(openai, { ...cfg, apiKeys: {} })).toBe('');
  });
});
