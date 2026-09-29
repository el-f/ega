import type { BackendId, Settings } from '@/shared/types';
import type { Task } from '@/shared/task-prompts';

/** `backendOrder` minus the disabled and the unregistered. Ids only — the caller probes `isAvailable`. */
export function computeBackendOrder(
  settings: Settings,
  registeredIds?: readonly BackendId[],
): BackendId[] {
  const disabled = new Set(settings.disabledBackends);
  const known = registeredIds ? new Set(registeredIds) : null;
  return settings.backendOrder.filter((id) => {
    if (disabled.has(id)) return false;
    if (known && !known.has(id)) return false;
    return true;
  });
}

export interface ChainResolveInput {
  backendOrder: readonly BackendId[];
  disabledBackends: readonly BackendId[];
  taskBackendChains: Partial<Record<Task, readonly BackendId[] | undefined>>;
  /** Per-task pin. `'auto'` or absent means no pin. */
  taskBackends?: Partial<Record<Task, BackendId | 'auto' | undefined>> | undefined;
}

/** The one chain-order rule; the router probes this list in order. A task chain narrows routing but cannot zero it, so an empty one falls back to `backendOrder`. */
export function resolveChainForTask(
  input: ChainResolveInput,
  task: Task,
  registeredIds?: readonly BackendId[],
): BackendId[] {
  const disabled = new Set(input.disabledBackends);
  const known = registeredIds ? new Set(registeredIds) : null;
  const filterFn = (id: BackendId): boolean => {
    if (disabled.has(id)) return false;
    if (known && !known.has(id)) return false;
    return true;
  };
  const chain = input.taskBackendChains[task];
  const taskFiltered = chain && chain.length > 0 ? chain.filter(filterFn) : [];
  const resolved = taskFiltered.length > 0 ? taskFiltered : input.backendOrder.filter(filterFn);
  const pin = input.taskBackends?.[task];
  if (pin && pin !== 'auto' && filterFn(pin)) {
    return [pin, ...resolved.filter((id) => id !== pin)];
  }
  return resolved;
}
