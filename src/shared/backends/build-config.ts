import type { Settings } from '../types';
import type { Task } from '../task-prompts';
import type { TaskEffort } from '../settings-schema';
import type { BackendConfig } from './base';
import { CLOUD_PROVIDER_IDS, apiKeyField } from '../provider-ids';
import { resolveTaskEffort } from '../backend-params';

/** `exactOptionalPropertyTypes` forbids `undefined` on optional keys, so every spread is conditional. */
export function buildBackendConfig(s: Settings, task?: Task, effort?: TaskEffort): BackendConfig {
  const apiKeys: BackendConfig['apiKeys'] = {};
  for (const id of CLOUD_PROVIDER_IDS) {
    const v = s[apiKeyField(id)];
    if (v !== undefined) apiKeys[id] = v;
  }
  return {
    apiKeys,
    model: s.model,
    ...(s.ollamaUrl ? { ollamaUrl: s.ollamaUrl } : {}),
    ...(s.localServerUrl ? { localServerUrl: s.localServerUrl } : {}),
    ...(s.nativeCli ? { nativeCli: s.nativeCli } : {}),
    ...(s.localBackendTimeoutMs !== undefined
      ? { localBackendTimeoutMs: s.localBackendTimeoutMs }
      : {}),
    advanced: {
      temperature: s.advanced.temperature,
      maxTokens: s.advanced.maxTokens,
      effort: effort ?? resolveTaskEffort(s, task),
    },
  };
}
