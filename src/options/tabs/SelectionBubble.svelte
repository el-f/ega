<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { saveSettings } from '@/options/storage-with-toast';

  import TabHeader from '@/shared/components/TabHeader.svelte';
  import SelectionBubbleModeSection from '@/options/components/sections/SelectionBubbleModeSection.svelte';
  import ElementPickerSection from '@/options/components/sections/ElementPickerSection.svelte';
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
</script>

<section data-ega-tab="selection-bubble">
  <TabHeader tab="selection-bubble" />
  {#if s}
    <SelectionBubbleModeSection {s} onPatch={patch} />
    <ElementPickerSection {s} onPatch={patch} />
    <ContextMenuManager {s} onPatch={patch} />
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
</style>
