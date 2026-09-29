<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Tooltip } from 'bits-ui';

  type Side = 'top' | 'bottom' | 'left' | 'right';

  interface Props {
    trigger: Snippet;
    /** When both `text` and `content` are set, `content` wins. */
    text?: string;
    content?: Snippet;
    side?: Side;
  }

  const { trigger, text, content, side = 'top' }: Props = $props();
</script>

<Tooltip.Provider delayDuration={200} disableHoverableContent>
  <Tooltip.Root>
    <Tooltip.Trigger class="ega-tooltip-trigger">
      {@render trigger()}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content {side} sideOffset={6} class="ega-tooltip-content">
        {#if content}
          {@render content()}
        {:else if text}
          {text}
        {/if}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>

<style>
  /* Bits UI emits a <button> — strip its chrome so the consumer's trigger keeps its layout. */
  :global(.ega-tooltip-trigger) {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    cursor: inherit;
    display: inline-flex;
    align-items: center;
  }
  :global(.ega-tooltip-content) {
    background: var(--color-bg-elevated, var(--color-bg));
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-xs);
    font-family: var(--font-ui);
    line-height: var(--lh-body);
    box-shadow: 0 2px 8px var(--color-shadow-soft);
    max-width: 280px;
    white-space: pre-line;
    z-index: 2147483647;
  }
</style>
