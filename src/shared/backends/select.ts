import type { BackendId } from '@/shared/types';

/** The one chain rule: `backendOrder` minus the disabled and the unregistered. Ids only — the caller probes `isAvailable`. */
export function computeBackendOrder(
  settings: { backendOrder: readonly BackendId[]; disabledBackends: readonly BackendId[] },
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
