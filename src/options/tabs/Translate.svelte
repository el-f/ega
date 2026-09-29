<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { saveSettings } from '@/options/storage-with-toast';
  import { createTemplatesHandlers } from '@/options/templates-handlers';
  import { resolveActiveBackendId, resolveTaskBackendId } from '@/shared/backend-params';
  import { lookupModelId } from '@/shared/settings-schema';
  import { resolveSamplingSupport, type SamplingSupport } from '@/shared/backends/sampling-caps';
  import { ALL_TASKS, type Task } from '@/shared/task-prompts';

  import TabHeader from '@/shared/components/TabHeader.svelte';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import LangDefaultsSection from '@/options/components/sections/LangDefaultsSection.svelte';
  import TasksTonesSection from '@/options/components/sections/TasksTonesSection.svelte';
  import DisplaySurfaceSection from '@/options/components/sections/DisplaySurfaceSection.svelte';
  import StreamingSection from '@/options/components/sections/StreamingSection.svelte';
  import PageContextSection from '@/options/components/sections/PageContextSection.svelte';
  import CacheSection from '@/options/components/sections/CacheSection.svelte';
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

  // Deleting a per-task override needs the factory's bypass helpers, because the deep merge would restore the key.
  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next) => onSetSettings(next),
  });

  const FULL_CAPS: SamplingSupport = { temperature: true, maxTokens: true, reasoningEffort: false };
  const capsFor = (settings: Settings, backendId: string): SamplingSupport =>
    resolveSamplingSupport(backendId, lookupModelId(settings.model, backendId));

  // Both the backend and its model id are read inside $derived.by, so the caps recompute when either one changes.
  const caps: SamplingSupport = $derived.by(() =>
    s ? capsFor(s, resolveActiveBackendId(s)) : FULL_CAPS,
  );
  // The router builds each request from its own task's chain head, which a pin can move off the translate head.
  const taskCaps: Record<Task, SamplingSupport> = $derived.by(
    () =>
      Object.fromEntries(
        ALL_TASKS.map((task) => [task, s ? capsFor(s, resolveTaskBackendId(s, task)) : FULL_CAPS]),
      ) as Record<Task, SamplingSupport>,
  );
</script>

<section data-ega-tab="translate">
  <TabHeader tab="translate" />
  {#if s}
    <DisplaySurfaceSection {s} onPatch={patch} />
    <LangDefaultsSection {s} onPatch={patch} />
    <TasksTonesSection {s} onPatch={patch} />
    <StreamingSection {s} onPatch={patch} />
    <CacheSection {s} onPatch={patch} />
    <PageContextSection {s} onPatch={patch} />
    <PageTranslateSection {s} onPatch={patch} />
    <RoutingSection {s} onPatch={patch} onPatchAdvanced={handlers.patchAdvanced} />
    <GenerationSection
      {s}
      {caps}
      {taskCaps}
      onSetGlobalTemperature={handlers.setGlobalTemperature}
      onSetGlobalMaxTokens={handlers.setGlobalMaxTokens}
      onSetGlobalReasoningEffort={handlers.setGlobalReasoningEffort}
      onSetTaskTemperature={handlers.setTaskTemperature}
      onSetTaskMaxTokens={handlers.setTaskMaxTokens}
      onSetTaskReasoningEffort={handlers.setTaskReasoningEffort}
    />
    <ContextMenuManager {s} onPatch={patch} />
  {:else}
    <LoadingState rows={6} label="Loading translation settings…" />
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
</style>
