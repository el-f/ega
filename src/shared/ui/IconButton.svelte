<script lang="ts">
  import type { Component } from 'svelte';
  import { Tooltip } from 'bits-ui';
  import Icon from './Icon.svelte';

  type Variant = 'default' | 'primary' | 'danger';
  type Size = 'sm' | 'md' | 'lg';
  type TooltipPlacement = 'top' | 'bottom';

  interface Props {
    icon: Component<{ size?: number | string; strokeWidth?: number | string }>;
    ariaLabel: string;
    /** Hover/focus label, portaled + collision-aware via Bits UI Tooltip.
     *  Defaults to ariaLabel; pass `''` to opt out. */
    tooltip?: string;
    /** Side of the button to anchor the tooltip on. Bits UI flips when
     *  the chosen side would overflow the viewport. */
    tooltipPlacement?: TooltipPlacement;
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    dataAttrs?: Record<string, string | number | boolean | undefined>;
    onclick?: (e: MouseEvent) => void;
  }

  let {
    icon,
    ariaLabel,
    tooltip,
    tooltipPlacement = 'bottom',
    variant = 'default',
    size = 'md',
    disabled = false,
    dataAttrs,
    onclick,
  }: Props = $props();

  const iconSize = $derived(size === 'sm' ? 16 : size === 'lg' ? 24 : 20);
  const tip = $derived(tooltip ?? ariaLabel);
  const showTooltip = $derived(tip.length > 0);
</script>

{#if showTooltip}
  <Tooltip.Provider delayDuration={150} disableHoverableContent>
    <Tooltip.Root>
      <Tooltip.Trigger
        type="button"
        class="ega-icon-btn variant-{variant} size-{size}"
        aria-label={ariaLabel}
        {disabled}
        {...dataAttrs ?? {}}
        {onclick}
      >
        <Icon {icon} size={iconSize} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={tooltipPlacement} sideOffset={6} class="ega-icon-btn-tooltip">
          {tip}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>
{:else}
  <button
    type="button"
    class="ega-icon-btn variant-{variant} size-{size}"
    aria-label={ariaLabel}
    {disabled}
    {...dataAttrs ?? {}}
    {onclick}
  >
    <Icon {icon} size={iconSize} />
  </button>
{/if}

<style>
  /* :global because the bits-ui Tooltip.Trigger renders the <button> outside this component's scope. */
  :global(.ega-icon-btn) {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-fg-subtle);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  :global(.ega-icon-btn:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }
  :global(.ega-icon-btn:not(:disabled):hover) {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  :global(.ega-icon-btn.size-sm) {
    width: 28px;
    height: 28px;
  }
  :global(.ega-icon-btn.size-md) {
    width: 32px;
    height: 32px;
  }
  :global(.ega-icon-btn.size-lg) {
    width: 36px;
    height: 36px;
  }
  :global(.ega-icon-btn.variant-primary) {
    color: var(--color-accent);
  }
  :global(.ega-icon-btn.variant-primary:not(:disabled):hover) {
    background: var(--color-accent-bg-hover);
  }
  /* Rests muted like every sibling; the trash glyph carries the meaning, red is the commitment cue. */
  :global(.ega-icon-btn.variant-danger:not(:disabled):hover),
  :global(.ega-icon-btn.variant-danger:not(:disabled):focus-visible) {
    color: var(--color-danger-fg);
    background: var(--color-danger-bg-soft);
  }
  /* border-color, not border: the 1px transparent border stays, so the pressed state costs no reflow. */
  :global(.ega-icon-btn[aria-pressed='true']) {
    color: var(--color-accent-hover);
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
  }

  /* shadow-css-lint-allow: ega-icon-btn-tooltip — Tooltip.Portal renders into document.body, outside the shadow root. */
  :global(.ega-icon-btn-tooltip) {
    background: var(--color-bg-elevated, var(--color-bg-sunken));
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-xs);
    font-family: var(--font-ui);
    line-height: var(--lh-body);
    box-shadow: 0 2px 8px var(--color-shadow-soft, var(--color-shadow));
    max-width: 220px;
    z-index: 2147483647;
  }
</style>
