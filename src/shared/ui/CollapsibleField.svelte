<script lang="ts">
  import type { Snippet } from 'svelte';
  import { slide } from 'svelte/transition';
  import { prefersReducedMotion } from 'svelte/motion';

  interface Props {
    open: boolean;
    children: Snippet;
  }

  let { open, children }: Props = $props();

  // transition:slide tweens a JS number, so the reduced-motion block in tokens.css cannot reach it.
  const effectiveDuration = $derived(prefersReducedMotion.current ? 0 : 140);
</script>

{#if open}
  <div class="ega-collapsible-field" transition:slide={{ duration: effectiveDuration }}>
    {@render children()}
  </div>
{/if}

<style>
  .ega-collapsible-field {
    display: flex;
    flex-direction: column;
    gap: var(--row-gap);
    min-width: 0;
  }
</style>
