import type { RouterDeps } from '@/background/router';
import type { Settings } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

/** Defaults with an Anthropic key and every backend enabled. */
export function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    disabledBackends: [],
    ...patch,
  };
}

/** Router deps with no backends, `mkSettings()`, a no-op cache and a silent logger; any other field passes through. */
export function baseDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return {
    backends: [],
    getSettings: async () => mkSettings(),
    cache: { get: async () => undefined, set: async () => {} },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    ...overrides,
  };
}
