<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { saveSettings } from '@/options/storage-with-toast';
  import { createTemplatesHandlers } from '@/options/templates-handlers';
  import { resolveActiveBackendId } from '@/shared/backend-params';
  import { lookupModelId, resolveModelId } from '@/shared/settings-schema';
  import { resolveSamplingSupport, type SamplingSupport } from '@/shared/backends/sampling-caps';
  import { ollamaBaseUrl } from '@/shared/backends/ollama-show';
  import type { TaskEffort } from '@/shared/settings-schema';
  import { fetchLiveEfforts, hasLiveEfforts } from '@/options/live-efforts';
  import { sendMsg } from '@/shared/messages';
  import { CLOUD_PROVIDER_IDS, apiKeyField, type CloudProviderId } from '@/shared/provider-ids';

  import TabHeader from '@/shared/components/TabHeader.svelte';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import LangDefaultsSection from '@/options/components/sections/LangDefaultsSection.svelte';
  import DisplaySurfaceSection from '@/options/components/sections/DisplaySurfaceSection.svelte';
  import StreamingSection from '@/options/components/sections/StreamingSection.svelte';
  import PageContextSection from '@/options/components/sections/PageContextSection.svelte';
  import PageTranslateSection from '@/options/components/sections/PageTranslateSection.svelte';
  import RoutingSection from '@/options/components/sections/RoutingSection.svelte';
  import GenerationSection from '@/options/components/sections/GenerationSection.svelte';
  import ContextMenuManager from '@/options/components/ContextMenuManager.svelte';

  interface Props {
    s: Settings | null;
    onSetSettings: (next: Settings) => void;
  }

  const { s, onSetSettings }: Props = $props();

  async function patch(p: Partial<Settings>): Promise<void> {
    const next = await saveSettings(p);
    if (next) onSetSettings(next);
  }

  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next) => onSetSettings(next),
  });

  const FULL_CAPS: SamplingSupport = { temperature: true, maxTokens: true, efforts: [] };
  const capsFor = (settings: Settings, backendId: string): SamplingSupport =>
    resolveSamplingSupport(backendId, lookupModelId(settings.model, backendId));

  // The router's own probe names the backend that answers (it pings native and Ollama); until it replies, the keys decide.
  const chainKey = $derived(
    s
      ? JSON.stringify([
          s.backendOrder,
          s.disabledBackends,
          CLOUD_PROVIDER_IDS.filter((id) => Boolean(s[apiKeyField(id)])),
          s.ollamaUrl ?? '',
          s.localServerUrl ?? '',
          s.nativeCli ?? '',
        ])
      : null,
  );
  let probed = $state<{ key: string; active: string | null } | null>(null);
  $effect(() => {
    const key = chainKey;
    if (key === null) return;
    let alive = true;
    void sendMsg({ kind: 'backend:probe-all' })
      .then((r) => {
        if (alive && r && typeof r === 'object' && 'active' in r)
          probed = { key, active: r.active };
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  });
  const activeBackend = $derived(
    s
      ? ((probed?.key === chainKey ? probed.active : null) ?? resolveActiveBackendId(s))
      : 'anthropic',
  );
  const runnable = (id: string): boolean =>
    !(CLOUD_PROVIDER_IDS as readonly string[]).includes(id) ||
    Boolean(s?.[apiKeyField(id as CloudProviderId)]);
  const activeModel = $derived(s ? resolveModelId(s.model, activeBackend) : '');
  // Ollama and OpenRouter report per model whether it thinks, so their levels come from them, not a name list.
  const liveKey = $derived(
    // No key, no request: OpenRouter's list is read only once the user can send to it.
    s && hasLiveEfforts(activeBackend) && runnable(activeBackend)
      ? [
          activeBackend,
          activeBackend === 'ollama' ? ollamaBaseUrl(s.ollamaUrl) : '',
          activeModel,
        ].join(' ')
      : null,
  );
  let live = $state<{ key: string; efforts: readonly TaskEffort[] | null } | null>(null);
  $effect(() => {
    const key = liveKey;
    const settings = s;
    const backend = activeBackend;
    const model = activeModel;
    if (key === null || settings === null) return;
    let alive = true;
    void fetchLiveEfforts(backend, model, settings).then((efforts) => {
      if (alive) live = { key, efforts };
    });
    return () => {
      alive = false;
    };
  });
  const caps: SamplingSupport = $derived.by(() => {
    if (!s) return FULL_CAPS;
    const base = capsFor(s, activeBackend);
    const efforts = live?.key === liveKey ? live.efforts : null;
    return efforts ? { ...base, efforts } : base;
  });
</script>

<section data-ega-tab="translate">
  <TabHeader tab="translate" />
  {#if s}
    <div class="tab-group" role="group" aria-labelledby="tg-results">
      <p id="tg-results" class="tab-group-label">Answers</p>
      <DisplaySurfaceSection {s} onPatch={patch} />
      <LangDefaultsSection {s} onPatch={patch} />
      <StreamingSection {s} onPatch={patch} />
    </div>
    <div class="tab-group" role="group" aria-labelledby="tg-requests">
      <p id="tg-requests" class="tab-group-label">What Ega sends and to whom</p>
      <PageContextSection {s} onPatch={patch} />
      <RoutingSection {s} onPatch={patch} onPatchAdvanced={handlers.patchAdvanced} />
      <GenerationSection
        {s}
        {caps}
        onSetGlobalTemperature={handlers.setGlobalTemperature}
        onSetGlobalMaxTokens={handlers.setGlobalMaxTokens}
        {activeBackend}
        {activeModel}
        onSetGlobalEffort={handlers.setGlobalEffort}
      />
    </div>
    <div class="tab-group" role="group" aria-labelledby="tg-page">
      <p id="tg-page" class="tab-group-label">Whole pages and the right-click menu</p>
      <PageTranslateSection {s} onPatch={patch} />
      <ContextMenuManager {s} onPatch={patch} />
    </div>
  {:else}
    <LoadingState rows={6} label="Loading translation settings…" />
  {/if}
</section>

<style>
  section,
  .tab-group {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  .tab-group + .tab-group {
    margin-top: var(--space-4);
  }
  .tab-group-label {
    margin: 0;
    font-size: var(--fs-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
</style>
