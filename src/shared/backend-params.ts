import type { Settings } from './types';
import type { Task } from './task-prompts';
import { resolveChainForTask } from './backends/select';

/** The head of the router's chain for `task` (pin, then task chain, then backendOrder), else 'anthropic'. */
export function resolveTaskBackendId(s: Settings, task: Task): string {
  const chain = resolveChainForTask(
    {
      backendOrder: s.backendOrder,
      disabledBackends: s.disabledBackends,
      taskBackendChains: s.advanced.taskBackendChains,
      taskBackends: s.taskBackends,
    },
    task,
  );
  return chain[0] ?? 'anthropic';
}

/** The head of the router's translate chain. */
export function resolveActiveBackendId(s: Settings): string {
  return resolveTaskBackendId(s, 'translate');
}

/** buildBackendConfig reads the task override through this; absent falls back to the global temperature. */
export function resolveTaskTemperature(s: Settings, task?: Task): number {
  if (task !== undefined) {
    const v = s.taskTemperatures?.[task];
    if (typeof v === 'number') return v;
  }
  return s.advanced.temperature;
}

export function resolveTaskMaxTokens(s: Settings, task?: Task): number {
  if (task !== undefined) {
    const v = s.taskMaxTokens?.[task];
    if (typeof v === 'number') return v;
  }
  return s.advanced.maxTokens;
}

export function resolveTaskReasoningEffort(s: Settings, task?: Task): 'low' | 'medium' | 'high' {
  if (task !== undefined) {
    const v = s.taskReasoningEfforts?.[task];
    if (v !== undefined) return v;
  }
  return s.advanced.reasoningEffort;
}
