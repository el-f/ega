<script lang="ts" module>
  import type { Component } from 'svelte';
  import type { SettingsTab } from '@/shared/settings-tabs';

  export type TabId = SettingsTab;

  // A plain object, not a Map, because svelte/prefer-svelte-reactivity flags Map and this memo holds no reactive state.
  type LazyId = 'advanced' | 'translate' | 'tasks' | 'selection-bubble' | 'glossary';
  const lazyCache: Partial<Record<LazyId, Promise<Component>>> = {};

  export function loadLazyTab(id: LazyId): Promise<Component> {
    const cached = lazyCache[id];
    if (cached !== undefined) return cached;
    const p =
      id === 'translate'
        ? import('./tabs/Translate.svelte').then((m) => m.default as Component)
        : id === 'tasks'
          ? import('./tabs/Tasks.svelte').then((m) => m.default as Component)
          : id === 'selection-bubble'
            ? import('./tabs/SelectionBubble.svelte').then((m) => m.default as Component)
            : id === 'glossary'
              ? import('./tabs/Glossary.svelte').then((m) => m.default as Component)
              : import('./tabs/Advanced.svelte').then((m) => m.default as Component);
    lazyCache[id] = p;
    return p;
  }
</script>

<script lang="ts">
  import type { Settings } from '@/shared/types';
  import Backends from './tabs/Backends.svelte';
  import Languages from './tabs/Languages.svelte';
  import About from './tabs/About.svelte';

  interface Props {
    active: TabId;
    /** Owned by Options.svelte; null while loading, and tabs show a loading state. */
    s: Settings | null;
    /** Pushes the result into Options.svelte's live settings without waiting for storage.onChanged. */
    onSetSettings: (next: Settings) => void;
  }

  const { active, s, onSetSettings }: Props = $props();
</script>

<div class="options-pane">
  <!-- Keying the wrapper on `active` remounts the fragment, which re-runs the `tab-fade-in` keyframe. -->
  {#key active}
    <div class="tab-fade-in">
      {#if active === 'backends'}
        <Backends {s} {onSetSettings} />
      {:else if active === 'languages'}
        <Languages {s} {onSetSettings} />
      {:else if active === 'about'}
        <About />
      {:else}
        {#await loadLazyTab(active) then Comp}
          <Comp {s} {onSetSettings} />
        {/await}
      {/if}
    </div>
  {/key}
</div>

<style>
  .options-pane {
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  .tab-fade-in {
    /* `backwards`, not `both`: a persistent transform establishes a containing block that traps a fixed Dialog backdrop. */
    animation: ega-tab-fade-in var(--motion-fast) var(--ease-out) backwards;
    /* SectionCard has no margin-block of its own, so the gap between stacked cards is set here. */
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  @keyframes ega-tab-fade-in {
    from {
      opacity: 0;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tab-fade-in {
      animation: none;
    }
  }
</style>
