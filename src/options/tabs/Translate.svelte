<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import type { Settings } from '@/shared/types';
  import { saveSettings } from '@/options/storage-with-toast';
  import { createTemplatesHandlers } from '@/options/templates-handlers';
  import { lookupModelId, resolveModelId, type TaskEffort } from '@/shared/settings-schema';
  import { resolveSamplingSupport, type SamplingSupport } from '@/shared/backends/sampling-caps';
  import { ollamaBaseUrl } from '@/shared/backends/ollama-show';
  import { fetchLiveEfforts, hasLiveEfforts } from '@/options/live-efforts';
  import { createRouteState } from '@/options/route-state.svelte';
  import { generationNotes } from '@/options/generation-notes';
  import { resetCardWithUndo } from '@/options/card-reset';

  import TabHeader from '@/shared/components/TabHeader.svelte';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import DisplaySurfaceSection from '@/options/components/sections/DisplaySurfaceSection.svelte';
  import StreamingSection from '@/options/components/sections/StreamingSection.svelte';
  import PageContextSection from '@/options/components/sections/PageContextSection.svelte';
  import PageTranslateSection from '@/options/components/sections/PageTranslateSection.svelte';
  import GenerationSection from '@/options/components/sections/GenerationSection.svelte';

  interface Props {
    s: Settings | null;
    onSetSettings: (next: Settings) => void;
  }

  const { s, onSetSettings }: Props = $props();

  async function patch(p: Partial<Settings>): Promise<void> {
    const next = await saveSettings(p);
    if (next) onSetSettings(next);
  }

  function resetCard(title: string, defaults: Partial<Settings>): Promise<void> {
    return s ? resetCardWithUndo(title, defaults, s, onSetSettings) : Promise.resolve();
  }

  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next) => onSetSettings(next),
  });

  // The backends a request will actually try, from the same probe the router runs.
  const route = createRouteState(() => s);
  const tried = $derived((route.plan?.tried ?? []).map(String));

  // Ollama and OpenRouter report per model whether it thinks, so their levels come from them, not a name list.
  const live = new SvelteMap<string, readonly TaskEffort[] | null>();
  const liveKeys = $derived(
    s
      ? tried
          .filter(hasLiveEfforts)
          .map((id) =>
            [
              id,
              id === 'ollama' ? ollamaBaseUrl(s.ollamaUrl) : '',
              resolveModelId(s.model, id),
            ].join(' '),
          )
      : [],
  );
  $effect(() => {
    const settings = s;
    if (!settings) return;
    let alive = true;
    for (const key of liveKeys) {
      if (live.has(key)) continue;
      const [id = ''] = key.split(' ');
      void fetchLiveEfforts(id, resolveModelId(settings.model, id), settings).then((efforts) => {
        if (alive) live.set(key, efforts);
      });
    }
    return () => {
      alive = false;
    };
  });

  function capsOf(id: string): SamplingSupport {
    if (!s) return { temperature: true, maxTokens: true, efforts: [] };
    const base = resolveSamplingSupport(id, lookupModelId(s.model, id));
    const key = liveKeys.find((k) => k.startsWith(`${id} `));
    const efforts = key === undefined ? null : (live.get(key) ?? null);
    return efforts ? { ...base, efforts } : base;
  }
  const notes = $derived(s ? generationNotes(s.advanced.effort, tried, capsOf) : null);
</script>

<section data-ega-tab="translate">
  <TabHeader tab="translate" />
  {#if s && notes}
    <DisplaySurfaceSection {s} onPatch={patch} onResetCard={resetCard} />
    <PageContextSection {s} onPatch={patch} />
    <GenerationSection
      {s}
      {notes}
      onSetGlobalTemperature={handlers.setGlobalTemperature}
      onSetGlobalMaxTokens={handlers.setGlobalMaxTokens}
      onSetGlobalEffort={handlers.setGlobalEffort}
      onResetCard={resetCard}
    />
    <StreamingSection {s} onPatch={patch} />
    <PageTranslateSection {s} onPatch={patch} />
  {:else}
    <LoadingState rows={6} label="Loading answer settings…" />
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
  }
</style>
