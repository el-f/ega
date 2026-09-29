import type { BackendConfig } from './base';
import { CLOUD_PROVIDER_IDS, type CloudProviderId } from '../provider-ids';

/** Everything a surface needs to show a cloud provider. `id` is also the `apiKeys` / `model` slot and the `${id}ApiKey` settings field. */
export interface CloudProviderProfile {
  readonly id: CloudProviderId;
  /** Human label for cards, the active chip and error messages ("Groq HTTP 429"). */
  readonly label: string;
  /** Where the user mints a key. */
  readonly signupUrl: string;
  /** Key-shape hint for the input placeholder ("sk-…"). */
  readonly keyPlaceholder: string;
  /** Fallback model id when the configured slot is empty. */
  readonly defaultModel: string;
}

/** One entry here adds a provider — `OpenAICompatBackend` reads it, so no subclass is needed. */
export interface OpenAICompatProfile extends CloudProviderProfile {
  /** Chat-completions endpoint. */
  readonly baseUrl: string;
  /** `/models` listing endpoint for `discoverModels`. */
  readonly modelsUrl: string;
  /** True when the default model accepts images; gates the `translateImage` path. */
  readonly canVision: boolean;
  /** Keeps only chat-capable ids in `discoverModels`; absent means keep every id. */
  readonly discoverFilter?: (id: string) => boolean;
}

/** OpenAI's `/v1/models` mixes non-chat families in; keep chat-capable ids. */
const openAiChatFamilies = (id: string): boolean =>
  /^(?:gpt-|o1-|o3-|o4-|chatgpt-|omni-)/i.test(id);

// `satisfies` makes a provider id with no profile, or a profile with no id, a compile error.
const PROFILE_BY_ID = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    signupUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    defaultModel: 'claude-haiku-4-5-20251001',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    signupUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    modelsUrl: 'https://api.openai.com/v1/models',
    defaultModel: 'gpt-4o-mini',
    canVision: true,
    discoverFilter: openAiChatFamilies,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
    defaultModel: 'gemini-2.5-flash',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    signupUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    defaultModel: 'llama-3.3-70b-versatile',
    // No filter: Groq curates its catalog, and an OpenAI-shape filter would drop llama and qwen.
    canVision: false,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    signupUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-…',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    modelsUrl: 'https://api.deepseek.com/v1/models',
    defaultModel: 'deepseek-chat',
    canVision: false,
  },
  together: {
    id: 'together',
    label: 'Together',
    signupUrl: 'https://api.together.xyz/settings/api-keys',
    keyPlaceholder: 'Paste API key here',
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    modelsUrl: 'https://api.together.xyz/v1/models',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    canVision: false,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    signupUrl: 'https://console.mistral.ai/api-keys/',
    keyPlaceholder: 'Paste API key here',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    defaultModel: 'mistral-small-latest',
    canVision: false,
  },
  xai: {
    id: 'xai',
    label: 'xAI',
    signupUrl: 'https://console.x.ai/',
    keyPlaceholder: 'xai-…',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    modelsUrl: 'https://api.x.ai/v1/models',
    defaultModel: 'grok-4.3',
    canVision: false,
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks',
    signupUrl: 'https://fireworks.ai/account/api-keys',
    keyPlaceholder: 'fw_…',
    baseUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
    modelsUrl: 'https://api.fireworks.ai/inference/v1/models',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    canVision: false,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    signupUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    // A vision-capable default keeps the image path working; any routed model id also works.
    defaultModel: 'openai/gpt-4o-mini',
    canVision: true,
  },
} satisfies Record<CloudProviderId, CloudProviderProfile | OpenAICompatProfile>;

/** Every cloud provider, in `CLOUD_PROVIDER_IDS` order. */
export const CLOUD_PROFILES: readonly CloudProviderProfile[] = CLOUD_PROVIDER_IDS.map(
  (id) => PROFILE_BY_ID[id],
);

export function getCloudProfile(id: CloudProviderId): CloudProviderProfile {
  return PROFILE_BY_ID[id];
}

function isOpenAICompat(p: CloudProviderProfile): p is OpenAICompatProfile {
  return 'baseUrl' in p;
}

const OPENAI_COMPAT_PROFILES: readonly OpenAICompatProfile[] =
  CLOUD_PROFILES.filter(isOpenAICompat);

/** Look up an OpenAI-compatible profile by id. Null for unknown ids so callers can degrade. */
export function getProfile(id: string): OpenAICompatProfile | null {
  return OPENAI_COMPAT_PROFILES.find((p) => p.id === id) ?? null;
}

/** Every OpenAI-compatible profile; Anthropic and Gemini have their own backends. */
export function allProfiles(): readonly OpenAICompatProfile[] {
  return OPENAI_COMPAT_PROFILES;
}

/** Resolve the configured model for a profile, falling back to its default. */
export function profileModel(profile: OpenAICompatProfile, cfg: BackendConfig): string {
  return cfg.model[profile.id] || profile.defaultModel;
}

/** Resolve the API key for a profile from config ('' when absent). */
export function profileApiKey(profile: OpenAICompatProfile, cfg: BackendConfig): string {
  return cfg.apiKeys[profile.id] ?? '';
}
