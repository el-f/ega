<script lang="ts">
  import type { Component } from 'svelte';

  // `icon` is a component, not a name, so Vite can tree-shake the unused lucide icons.
  interface Props {
    icon: Component<{ size?: number | string; strokeWidth?: number | string; class?: string }>;
    size?: 16 | 20 | 24 | 28;
    strokeWidth?: number;
    class?: string;
    ariaLabel?: string;
  }

  let {
    icon: IconComponent,
    size = 20,
    strokeWidth = 1.5,
    class: cls = '',
    ariaLabel,
  }: Props = $props();
</script>

{#if ariaLabel}
  <span class="ega-icon {cls}" data-ega-icon role="img" aria-label={ariaLabel}>
    <IconComponent {size} {strokeWidth} />
  </span>
{:else}
  <span class="ega-icon {cls}" data-ega-icon aria-hidden="true">
    <IconComponent {size} {strokeWidth} />
  </span>
{/if}

<style>
  .ega-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    color: currentColor;
  }
</style>
