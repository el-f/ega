<script lang="ts">
  import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import type { Variety } from '@/shared/types';

  interface Props {
    sourceLang: string;
    targetLang: string;
    varieties: readonly Variety[];
    onSourceChange: (v: string) => void;
    onTargetChange: (v: string) => void;
    onSwap: () => void;
  }

  let { sourceLang, targetLang, varieties, onSourceChange, onTargetChange, onSwap }: Props =
    $props();

  function setSource(v: string): void {
    if (v !== sourceLang) onSourceChange(v);
  }
  // 'auto' is valid only as a source, so swapping it into the target slot would leave To blank.
  const swapOff = $derived(sourceLang === 'auto');

  function setTarget(v: string): void {
    if (v !== targetLang) onTargetChange(v);
  }
</script>

<div class="popup-langs" role="group" aria-labelledby="pop-langs-label">
  <span id="pop-langs-label" class="group-label">Default languages</span>
  <div class="popup-lang-pair" data-ega-lang-pair>
    <label class="lang-label" for="pop-lang">
      <span class="ega-sr-only">From</span>
      <LanguagePicker
        id="pop-lang"
        {varieties}
        includeAuto
        value={sourceLang}
        onchange={setSource}
      />
    </label>
    <!-- Shown but off while From is Auto-detect: hiding it left a hole between the pickers, and removing it
         would resize them (R63). aria-disabled keeps the Tab stop; the name says why, and the tooltip shows the name. -->
    <span class="swap">
      <IconButton
        icon={ArrowLeftRight}
        ariaLabel={swapOff
          ? 'Swap languages (needs a source language, not Auto-detect)'
          : 'Swap languages'}
        size="sm"
        dataAttrs={swapOff ? { 'aria-disabled': 'true' } : {}}
        onclick={() => {
          if (!swapOff) onSwap();
        }}
      />
    </span>
    <label class="lang-label" for="pop-target">
      <span class="ega-sr-only">To</span>
      <LanguagePicker id="pop-target" {varieties} value={targetLang} onchange={setTarget} />
    </label>
  </div>
</div>

<style>
  .popup-langs {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .group-label {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .popup-lang-pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
  }
  .swap {
    display: flex;
  }
  .lang-label {
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .lang-label :global(.ega-lang-picker) {
    width: 100%;
    min-inline-size: 0;
  }
</style>
