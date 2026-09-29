import type { Settings } from '../types';
import type { Task } from '../task-prompts';
import type { BackendConfig } from './base';
import { CLOUD_PROVIDER_IDS, apiKeyField } from '../provider-ids';
import {
  resolveTaskMaxTokens,
  resolveTaskReasoningEffort,
  resolveTaskTemperature,
} from '../backend-params';

/** `exactOptionalPropertyTypes` forbids `undefined` on optional keys, so every spread is conditional. */
export function buildBackendConfig(s: Settings, task?: Task): BackendConfig {
  const apiKeys: BackendConfig['apiKeys'] = {};
  for (const id of CLOUD_PROVIDER_IDS) {
    const v = s[apiKeyField(id)];
    if (v !== undefined) apiKeys[id] = v;
  }
  return {
    apiKeys,
    model: s.model,
    ...(s.ollamaUrl ? { ollamaUrl: s.ollamaUrl } : {}),
    ...(s.nativeCli ? { nativeCli: s.nativeCli } : {}),
    ...(s.localBackendTimeoutMs !== undefined
      ? { localBackendTimeoutMs: s.localBackendTimeoutMs }
      : {}),
    // Per-task resolution lives in backend-params so this projection and the cache key cannot drift.
    advanced: {
      promptTemplate: s.advanced.promptTemplate,
      perPresetTemplates: s.advanced.perPresetTemplates,
      temperature: resolveTaskTemperature(s, task),
      maxTokens: resolveTaskMaxTokens(s, task),
      reasoningEffort: resolveTaskReasoningEffort(s, task),
    },
  };
}
