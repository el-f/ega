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
    /** Disabled when source is 'auto' — swapping auto into the target slot is invalid. */
    swapDisabled?: boolean;
  }

  let {
    sourceLang,
    targetLang,
    varieties,
    onSourceChange,
    onTargetChange,
    onSwap,
    swapDisabled = false,
  }: Props = $props();

  function setSource(v: string): void {
    if (v !== sourceLang) onSourceChange(v);
  }
  function setTarget(v: string): void {
    if (v !== targetLang) onTargetChange(v);
  }
</script>

<div class="popup-lang-pair" data-ega-lang-pair>
  <label class="lang-label" for="pop-lang">
    <span class="ega-sr-only">From</span>
    <LanguagePicker id="pop-lang" {varieties} includeAuto value={sourceLang} onchange={setSource} />
  </label>
  <IconButton
    icon={ArrowLeftRight}
    ariaLabel={swapDisabled ? 'Pick a source language to swap' : 'Swap languages'}
    size="sm"
    disabled={swapDisabled}
    onclick={onSwap}
  />
  <label class="lang-label" for="pop-target">
    <span class="ega-sr-only">To</span>
    <LanguagePicker id="pop-target" {varieties} value={targetLang} onchange={setTarget} />
  </label>
</div>

<style>
  .popup-lang-pair {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .lang-label {
    flex: 1 1 50%;
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .lang-label :global(.ega-lang-picker) {
    width: 100%;
  }
</style>
