// A leaf on purpose: the worker strips these key fields from what it sends a page, without loading a backend.
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
export const BACKEND_IDS = ['native', 'ollama', 'localserver', ...CLOUD_PROVIDER_IDS] as const;

export const apiKeyField = (id: CloudProviderId) => `${id}ApiKey` as const;

export const BACKEND_API_KEY_FIELDS = CLOUD_PROVIDER_IDS.map(apiKeyField);
