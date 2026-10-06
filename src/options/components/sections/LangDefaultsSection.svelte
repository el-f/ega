<script lang="ts">
  import { onMount } from 'svelte';
  import type { Settings, Variety } from '@/shared/types';
  import { asLangSelection } from '@/shared/brands';
  import { listVarieties } from '@/shared/varieties';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import { toastStore } from '@/shared/components/toastStore';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();

  let varieties: Variety[] = $state([]);
  onMount(async () => {
    varieties = await listVarieties();
  });

  // Read-only mirrors: writes go through the change handler, so there is no local copy to resync and no mount echo.
  const src = $derived(s.defaultLang);
  const tgt = $derived(s.defaultTargetLang);

  // 'auto' is valid only as a source, so swapping it into the target slot leaves the Target select blank.
  const swapDisabled = $derived(s.defaultLang === 'auto');

  function swap(): void {
    if (swapDisabled) return;
    void onPatch({ defaultLang: s.defaultTargetLang, defaultTargetLang: s.defaultLang });
    // Swap leaves focus on the IconButton — screen readers get no signal that
    // the source/target fields swapped. Polite toast lands in the live region.
    toastStore.push({ message: 'Languages swapped', variant: 'success' });
  }
</script>

<SectionCard title="Default languages" description="Used when you do not pick a language">
  <!-- LanguagePicker renders a plain <select>, so its native change event bubbles up to here. -->
  <div
    class="lang-row"
    onchange={(e) => {
      const target = e.target as HTMLSelectElement;
      const picked = asLangSelection(target.value);
      if (target.id === 'lds-src') void onPatch({ defaultLang: picked });
      else if (target.id === 'lds-tgt') void onPatch({ defaultTargetLang: picked });
    }}
  >
    <div class="field-cluster" data-ega-setting="defaults.defaultLang">
      <label for="lds-src">Source</label>
      <LanguagePicker id="lds-src" {varieties} includeAuto suppressAriaLabel value={src} />
    </div>

    <IconButton
      icon={ArrowLeftRight}
      ariaLabel="Swap languages"
      disabled={swapDisabled}
      onclick={swap}
    />

    <div class="field-cluster" data-ega-setting="defaults.defaultTargetLang">
      <label for="lds-tgt">Target</label>
      <LanguagePicker id="lds-tgt" {varieties} suppressAriaLabel value={tgt} />
    </div>
  </div>
</SectionCard>

<style>
  .lang-row {
    display: flex;
    align-items: end;
    gap: var(--space-2);
  }
  .field-cluster {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .field-cluster label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    font-weight: 500;
  }
</style>
