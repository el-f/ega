<script lang="ts">
  /** CSS-only preview of each display mode; the active one gets an accent border. */
  interface Props {
    variant: 'tooltip' | 'inline';
    active: boolean;
  }
  const { variant, active }: Props = $props();
</script>

<div class="mock" class:active aria-hidden="true">
  <div class="mock-page">
    {#if variant === 'tooltip'}
      <span class="mock-text">Lorem ipsum</span>&nbsp;<span class="mock-selection">dolor sit</span
      >&nbsp;<span class="mock-text">amet consectetur.</span>
      <div class="mock-tooltip"><span class="mock-tooltip-body">translated text</span></div>
    {:else}
      <span class="mock-text">Lorem ipsum</span>&nbsp;<span class="mock-inline"
        >translated text</span
      >&nbsp;<span class="mock-text">amet consectetur.</span>
    {/if}
  </div>
</div>

<style>
  .mock {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    background: var(--color-bg-sunken);
    transition:
      border-color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .mock.active {
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
  }
  .mock-page {
    position: relative;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    font-size: var(--fs-xs);
    line-height: 1.5;
    color: var(--color-fg-subtle);
    min-height: 72px;
  }
  .mock-selection {
    background: var(--color-accent-bg-soft);
    color: var(--color-fg);
    border-radius: 1px;
  }
  .mock-tooltip {
    position: absolute;
    top: calc(50% + 2px);
    left: 28%;
    background: var(--color-bg);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-1) var(--space-2);
    box-shadow: 0 8px 24px var(--color-shadow);
    line-height: 1.45;
    white-space: nowrap;
  }
  .mock-tooltip-body {
    font-size: var(--fs-xs);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .mock-inline {
    background-color: var(--color-accent-bg-hover);
    color: var(--color-fg);
    /* literal mirrors [data-ega-replaced] in content/page-styles.css — keep in sync, not a token there either */
    border-bottom: 1px dashed rgba(88, 166, 255, 0.4);
    cursor: help;
  }
</style>
