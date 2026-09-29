// A leaf on purpose: the content script strips the key fields without loading a backend.
export const CLOUD_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'gemini',
  'groq',
  'deepseek',
  'together',
  'mistral',
  'xai',
  'fireworks',
  'openrouter',
] as const;
export type CloudProviderId = (typeof CLOUD_PROVIDER_IDS)[number];

/** Every registered backend id, so settings can be read without loading the backend registry. */
export const BACKEND_IDS = ['native', 'ollama', ...CLOUD_PROVIDER_IDS] as const;

export const apiKeyField = (id: CloudProviderId) => `${id}ApiKey` as const;

export const BACKEND_API_KEY_FIELDS = CLOUD_PROVIDER_IDS.map(apiKeyField);
