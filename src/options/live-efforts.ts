import type { Settings } from '@/shared/types';
import type { TaskEffort } from '@/shared/settings-schema';
import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS } from '@/shared/constants';
import { fetchOllamaModelCaps, ollamaBaseUrl, ollamaEfforts } from '@/shared/backends/ollama-show';
import {
  fetchOpenRouterReasoning,
  openRouterEfforts,
} from '@/shared/backends/openrouter-reasoning';

const LIVE_TIMEOUT_MS = 5000;

/** Backends that report a model's Effort levels themselves, instead of ega matching its name. */
export function hasLiveEfforts(backend: string): boolean {
  return backend === 'ollama' || backend === 'openrouter';
}

/** The levels the daemon or provider reports for the model; null when ega cannot ask, so the name-based answer stays. */
export async function fetchLiveEfforts(
  backend: string,
  model: string,
  s: Settings,
): Promise<readonly TaskEffort[] | null> {
  if (backend === 'ollama') {
    const timeoutMs = Math.max(
      s.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
      LIVE_TIMEOUT_MS,
    );
    const caps = await fetchOllamaModelCaps(ollamaBaseUrl(s.ollamaUrl), model, timeoutMs);
    return caps ? ollamaEfforts(caps) : null;
  }
  if (backend === 'openrouter') {
    const r = await fetchOpenRouterReasoning(model, LIVE_TIMEOUT_MS);
    return r === undefined ? null : openRouterEfforts(r);
  }
  return null;
}
