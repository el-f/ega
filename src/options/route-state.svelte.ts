import { sendMsg } from '@/shared/messages';
import { backendHasRequiredKey, backendNeedsKey } from '@/shared/backends/key-presence';
import { getRegisteredBackendIds, resolveBackend } from '@/shared/backends/registry';
import { computeBackendOrder } from '@/shared/backends/select';
import { CLOUD_PROVIDER_IDS, apiKeyField } from '@/shared/provider-ids';
import { routePlan, type ImageAbility, type Readiness, type RoutePlan } from '@/shared/route-plan';
import type { BackendId, Settings } from '@/shared/types';

/** Readiness for the rows routePlan walks: a cloud key decides at once; local, server and native wait for the probe. */
function readinessFrom(
  s: Settings,
  order: readonly BackendId[],
  available: Readonly<Record<string, boolean>> | null,
): ReadonlyMap<BackendId, Readiness> {
  return new Map(
    order.map((id) => {
      if (backendNeedsKey(id)) return [id, backendHasRequiredKey(id, s) ? 'ready' : 'not-ready'];
      const probed = available?.[id];
      return [id, probed === undefined ? 'unknown' : probed ? 'ready' : 'not-ready'];
    }),
  );
}

/** ponytail: the chosen model is assumed to read images when its backend can; the router's per-model check is not mirrored. */
export function imageAbility(id: BackendId): ImageAbility {
  const b = resolveBackend(id);
  return {
    inImageChain: b?.manifest.capabilities.canVision === true,
    answersImages: b?.translateImage !== undefined,
  };
}

/** The probes depend on these and nothing else, so a write that leaves them alone re-asks nothing. */
function chainKeyOf(s: Settings): string {
  return JSON.stringify([
    s.backendOrder,
    s.disabledBackends,
    CLOUD_PROVIDER_IDS.filter((id) => Boolean(s[apiKeyField(id)])),
    s.ollamaUrl ?? '',
    s.localServerUrl ?? '',
    s.nativeCli ?? '',
    s.localBackendTimeoutMs ?? '',
  ]);
}

/**
 * What the router will try, for the options page: the service worker probes the backends in use (the same
 * probe the router runs), and routePlan turns that into First choice / Backup / Skipped / Not reached.
 */
export function createRouteState(settings: () => Settings | null) {
  let probed = $state<{ key: string; available: Record<string, boolean> } | null>(null);
  const key = $derived.by(() => {
    const s = settings();
    return s ? chainKeyOf(s) : null;
  });

  $effect(() => {
    const k = key;
    if (k === null) return;
    let alive = true;
    void sendMsg({ kind: 'backend:probe-all' })
      .then((r) => {
        if (alive && r && typeof r === 'object' && 'available' in r)
          probed = { key: k, available: r.available };
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  });

  const plan = $derived.by((): RoutePlan | null => {
    const s = settings();
    if (!s) return null;
    const order = computeBackendOrder(s, getRegisteredBackendIds());
    const available = probed?.key === key ? probed.available : null;
    return routePlan(
      order,
      readinessFrom(s, order, available),
      1 + s.advanced.retryCount,
      imageAbility,
    );
  });

  return {
    get plan(): RoutePlan | null {
      return plan;
    },
  };
}
