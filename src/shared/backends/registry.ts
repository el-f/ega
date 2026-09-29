import { AnthropicBackend } from './anthropic';
import { NativeBackend } from './native';
import { GeminiBackend } from './gemini';
import { OllamaBackend } from './ollama';
import { makeOpenAICompatBackend } from './openai-compat';
import { allProfiles } from './provider-profiles';
import type { TranslationBackend } from './base';
import { BACKEND_API_KEY_FIELDS } from '../provider-ids';
import type { BackendId, Settings } from '../types';

export { BACKEND_API_KEY_FIELDS };
/** `satisfies` proves each derived key field is a real Settings key at compile time. */
const _keyFieldsAreSettingsKeys = BACKEND_API_KEY_FIELDS satisfies readonly (keyof Settings)[];
void _keyFieldsAreSettingsKeys;

type BackendFactory = () => TranslationBackend;

/** Adding an OpenAI-compatible provider is one `provider-profiles.ts` entry — no code here. */
const OPENAI_COMPAT_FACTORIES: ReadonlyArray<BackendFactory> = allProfiles().map(
  (profile) => () => makeOpenAICompatBackend(profile.id),
);

export const BACKENDS: ReadonlyArray<BackendFactory> = [
  () => new NativeBackend(),
  () => new AnthropicBackend(),
  () => new GeminiBackend(),
  () => new OllamaBackend(),
  ...OPENAI_COMPAT_FACTORIES,
];

// A duplicate id throws at load — otherwise one backend's `isAvailable` masks another's.
const REGISTERED_INSTANCES: ReadonlyMap<BackendId, TranslationBackend> = (() => {
  const map = new Map<BackendId, TranslationBackend>();
  for (const f of BACKENDS) {
    const b = f();
    if (map.has(b.id)) throw new Error(`[ega.backends] duplicate backend id: ${b.id}`);
    map.set(b.id, b);
  }
  return map;
})();

const REGISTERED_IDS: ReadonlyArray<BackendId> = Array.from(REGISTERED_INSTANCES.keys());

export function getRegisteredBackendIds(): ReadonlyArray<BackendId> {
  return REGISTERED_IDS;
}

/** Returns null for an unknown id so callers can degrade on a stale stored pref. */
export function resolveBackend(id: string): TranslationBackend | null {
  return REGISTERED_INSTANCES.get(id as BackendId) ?? null;
}

/** Shallow copy of the cached instances; the instances themselves are reused. */
export function instantiateAll(): TranslationBackend[] {
  return Array.from(REGISTERED_INSTANCES.values());
}
