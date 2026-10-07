import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { sendMsg } from '@/shared/messages';
import { buildBackendConfig } from '@/shared/backends/build-config';
import { backendHasRequiredKey, backendNeedsKey } from '@/shared/backends/key-presence';
import { lookupModelId } from '@/shared/settings-schema';
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

/** What the router's per-model image check reads, so a write that leaves them alone asks nothing again. */
function modelCheckKey(s: Settings, id: BackendId): string {
  return JSON.stringify([
    lookupModelId(s.model, id),
    s.ollamaUrl ?? '',
    s.localBackendTimeoutMs ?? '',
  ]);
}

/**
 * Whether each backend in use can take an image, with the router's per-model check (Ollama's /api/show), kept
 * current while the calling component is mounted. A row is 'unknown' until its check answers; a failed check
 * counts as true, as in the router. Call it during component init.
 */
export function liveImageAbility(settings: () => Settings | null): (id: BackendId) => ImageAbility {
  const answers = new SvelteMap<BackendId, { key: string; accepts: boolean }>();
  const checks = $derived.by(() => {
    const s = settings();
    if (!s) return [];
    return computeBackendOrder(s, getRegisteredBackendIds())
      .filter((id) => resolveBackend(id)?.acceptsImages !== undefined)
      .map((id) => ({ id, key: modelCheckKey(s, id), cfg: buildBackendConfig(s) }));
  });
  $effect(() => {
    let alive = true;
    for (const { id, key, cfg } of checks) {
      if (untrack(() => answers.get(id)?.key) === key) continue;
      void (resolveBackend(id)?.acceptsImages?.(cfg) ?? Promise.resolve(true))
        .catch(() => true)
        .then((accepts) => {
          if (alive) answers.set(id, { key, accepts });
        });
    }
    return () => {
      alive = false;
    };
  });
  return (id) => {
    const b = resolveBackend(id);
    const check = checks.find((c) => c.id === id);
    const answer = answers.get(id);
    const accepts =
      check === undefined ? true : answer?.key === check.key ? answer.accepts : 'unknown';
    return {
      inImageChain: b?.manifest.capabilities.canVision === true ? accepts : false,
      answersImages: b?.translateImage !== undefined,
    };
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
  const imageAbility = liveImageAbility(settings);
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
