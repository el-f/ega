<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { ICON_REGISTRY, type ActionKind } from './action-icons';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';
  type LucideIcon = Component<{ size?: number | string; strokeWidth?: number | string }>;

  interface Props {
    children: Snippet;
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    title?: string | undefined;
    ariaLabel?: string;
    leadingIcon?: LucideIcon | undefined;
    /** Picks the glyph from ICON_REGISTRY; prefer it over leadingIcon for actions. */
    iconKind?: ActionKind;
    dataAttrs?: Record<string, string | number | boolean | undefined>;
    extraClass?: string;
    onclick?: (e: MouseEvent) => void;
    onkeydown?: (e: KeyboardEvent) => void;
    onblur?: (e: FocusEvent) => void;
    /** Keeps the Tab stop and is announced as unavailable; the click does nothing. Pair it with describedBy. */
    ariaDisabled?: boolean;
    /** Id of the visible line that says why, or what the button does. */
    describedBy?: string;
  }

  let {
    children,
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    title,
    ariaLabel,
    leadingIcon,
    iconKind,
    dataAttrs,
    extraClass,
    onclick,
    onkeydown,
    onblur,
    ariaDisabled = false,
    describedBy,
  }: Props = $props();

  const isDisabled = $derived(disabled || loading);
  // Icon size scales with the button size so the glyph optical-aligns
  // with the label x-height across sm/md/lg.
  const iconSize = $derived<16 | 20 | 24>(size === 'sm' ? 16 : size === 'lg' ? 24 : 20);
</script>

<button
  {type}
  class={['ega-btn', `variant-${variant}`, `size-${size}`, extraClass]}
  class:is-loading={loading}
  data-variant={variant}
  disabled={isDisabled}
  aria-busy={loading}
  {title}
  aria-label={ariaLabel}
  aria-disabled={ariaDisabled ? 'true' : undefined}
  aria-describedby={describedBy}
  {...dataAttrs ?? {}}
  onclick={ariaDisabled ? undefined : onclick}
  {onkeydown}
  {onblur}
>
  {#if iconKind !== undefined}
    {@const IconGlyph = ICON_REGISTRY[iconKind]}
    <span class="ega-icon" aria-hidden="true" data-action-icon={iconKind}>
      <IconGlyph size={iconSize} strokeWidth={1.5} />
    </span>
  {:else if leadingIcon}
    <Icon icon={leadingIcon} size={iconSize} />
  {/if}
  <span class="ega-btn-label">{@render children()}</span>
</button>

<style>
  .ega-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-family: var(--font-ui);
    font-weight: var(--ega-fw-medium, 500);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  /* Disabled-state via real tokens, not opacity-as-disabled.
     opacity: 0.55 was killing contrast against textured backgrounds. */
  .ega-btn:disabled,
  .ega-btn[aria-disabled='true'] {
    background: var(--color-bg-disabled);
    color: var(--color-fg-disabled);
    border-color: var(--color-border-disabled);
    cursor: var(--cursor-disabled);
  }
  .ega-btn.is-loading {
    position: relative;
    color: transparent;
  }
  .ega-btn.is-loading::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    /* secondary/ghost spinner color; variant + disabled overrides handle the rest */
    color: var(--color-fg);
    animation: ega-btn-spin 600ms linear infinite;
  }
  /* parent .is-loading sets color:transparent (hides label) — currentColor unusable on ::after */
  .ega-btn.variant-primary.is-loading::after,
  .ega-btn.variant-danger.is-loading::after {
    color: var(--color-accent-fg);
  }
  .ega-btn.is-loading:disabled::after {
    color: var(--color-fg-disabled);
  }
  @keyframes ega-btn-spin {
    to {
      transform: rotate(360deg);
    }
  }
  /* Sizes */
  .size-sm {
    min-height: 28px;
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-sm);
  }
  /* 32px with or without an icon (K-19), so a row of buttons keeps one height; a long label still wraps taller. */
  .size-md {
    min-height: 32px;
    padding: 0 var(--space-3);
    font-size: var(--fs-base);
  }
  .size-lg {
    padding: var(--space-3) var(--space-4);
    font-size: var(--fs-md);
  }
  /* Variants */
  .variant-primary {
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border-color: var(--color-accent);
  }
  .variant-primary:not(:disabled, [aria-disabled='true']):hover {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }
  .variant-secondary {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border-color: var(--color-control-border);
  }
  .variant-secondary:not(:disabled, [aria-disabled='true']):hover {
    background: var(--color-bg-hover);
  }
  .variant-ghost {
    background: transparent;
    color: var(--color-fg);
    border-color: transparent;
  }
  .variant-ghost:not(:disabled, [aria-disabled='true']):hover {
    background: var(--color-bg-hover);
  }
  .variant-danger {
    background: var(--color-danger);
    color: var(--color-accent-fg);
    border-color: var(--color-danger);
  }
  .variant-danger:not(:disabled, [aria-disabled='true']):hover {
    filter: brightness(1.1);
  }
  /* Focus-visible — base */
  .ega-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  /* Primary sits on accent background — flip to fg-on-accent so ring is legible */
  .ega-btn[data-variant='primary']:focus-visible {
    outline-color: var(--color-fg-on-accent, #fff); /* token-lint-allow */
    box-shadow: 0 0 0 4px var(--color-accent);
  }
  /* Danger — use a softer danger tone if available, else fall back to accent */
  .ega-btn[data-variant='danger']:focus-visible {
    outline-color: var(--color-danger-soft, var(--color-accent));
  }
</style>
