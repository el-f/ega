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
  /** Fields this provider needs on every chat request. */
  readonly extraBody?: Readonly<Record<string, unknown>>;
  /** False when the request schema rejects `stream_options`. */
  readonly streamUsage?: false;
  /** Top of the provider's temperature range when it is below ega's 2. */
  readonly maxTemperature?: number;
  /** Absent means `max_tokens`. */
  readonly maxTokensField?: 'max_completion_tokens';
}

const OPENAI_CHAT_ID = /^(?:gpt-|chat-latest$|o\d+(?:-|$))/i;
const OPENAI_NON_CHAT =
  /image|realtime|audio|transcribe|tts|live|search|moderation|codex|deep-research|cyber|daybreak|oss|instruct|completions|-pro(?:-|$)/i;

/** OpenAI's `/v1/models` mixes non-chat families in; keep chat-capable ids. */
const openAiChatFamilies = (id: string): boolean =>
  OPENAI_CHAT_ID.test(id) && !OPENAI_NON_CHAT.test(id);

const GROQ_NON_CHAT =
  /^(?:whisper-|canopylabs\/|meta-llama\/llama-prompt-guard-|openai\/gpt-oss-safeguard-)/i;

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
    // New accounts store chat completions by default; ega's requests carry page text.
    extraBody: { store: false },
    // Reasoning models reject max_tokens, and it is deprecated for every model.
    maxTokensField: 'max_completion_tokens',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
    defaultModel: 'gemini-3.5-flash-lite',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    signupUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    defaultModel: 'openai/gpt-oss-120b',
    // Not the OpenAI filter: Groq's chat ids carry many vendor prefixes, so drop the few non-chat families by name.
    discoverFilter: (id: string) => !GROQ_NON_CHAT.test(id),
    canVision: false,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    signupUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-…',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    modelsUrl: 'https://api.deepseek.com/v1/models',
    defaultModel: 'deepseek-flash',
    // Thinking is on by default; it spends max_tokens and ignores temperature.
    extraBody: { thinking: { type: 'disabled' } },
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
    // The request schema has additionalProperties: false and caps temperature at 1.5.
    streamUsage: false,
    maxTemperature: 1.5,
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
    defaultModel: 'accounts/fireworks/models/gpt-oss-120b',
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
    // `:batch` ids are OpenRouter's batch-only endpoint variants, not chat models.
    discoverFilter: (id: string) => !id.endsWith(':batch'),
  },
} satisfies Record<CloudProviderId, CloudProviderProfile | OpenAICompatProfile>;

/** Every cloud provider, in `CLOUD_PROVIDER_IDS` order. */
export const CLOUD_PROFILES: readonly CloudProviderProfile[] = CLOUD_PROVIDER_IDS.map(
  (id) => PROFILE_BY_ID[id],
);

export function getCloudProfile(id: CloudProviderId): CloudProviderProfile {
  return PROFILE_BY_ID[id];
}

const LOCAL_BACKEND_LABELS: Readonly<Record<string, string>> = {
  native: 'Native host (Claude Code / Codex)',
  ollama: 'Ollama',
  localserver: 'Local server (OpenAI-compatible)',
};

/** A backend's display name without loading the backend, so the popup chip stays out of the registry chunk. An unknown id comes back as is. */
export function backendLabel(id: string): string {
  if (Object.hasOwn(LOCAL_BACKEND_LABELS, id)) return LOCAL_BACKEND_LABELS[id] ?? id;
  return Object.hasOwn(PROFILE_BY_ID, id) ? PROFILE_BY_ID[id as CloudProviderId].label : id;
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

/** Resolve the API key for a profile from config ('' when absent). */
export function profileApiKey(profile: OpenAICompatProfile, cfg: BackendConfig): string {
  return cfg.apiKeys[profile.id] ?? '';
}
