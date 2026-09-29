<script lang="ts">
  import { RadioGroup } from 'bits-ui';
  import type { Component } from 'svelte';
  import Icon from './Icon.svelte';

  type Orientation = 'vertical' | 'horizontal';

  type LucideLike = Component<{
    size?: number | string;
    strokeWidth?: number | string;
  }>;

  interface Option {
    value: string;
    label: string;
    description?: string;
    /** Optional leading icon (a lucide component). */
    icon?: LucideLike;
  }

  interface Props {
    value: string;
    options: Option[];
    onValueChange: (next: string) => void;
    name?: string;
    disabled?: boolean;
    orientation?: Orientation;
    dataAttrs?: Record<string, string | number | boolean | undefined>;
  }

  let {
    value,
    options,
    onValueChange,
    name,
    disabled = false,
    orientation = 'vertical',
    dataAttrs,
  }: Props = $props();
</script>

<RadioGroup.Root
  {value}
  {disabled}
  {orientation}
  {onValueChange}
  class="ega-radio-group orientation-{orientation}"
  {...name === undefined ? {} : { name }}
  {...dataAttrs ?? {}}
>
  {#each options as option (option.value)}
    <label class="ega-radio-row" class:disabled>
      <RadioGroup.Item value={option.value} class="ega-radio-item">
        {#snippet children({ checked })}
          <span class="ega-radio-dot" class:checked aria-hidden="true"></span>
        {/snippet}
      </RadioGroup.Item>
      <span class="ega-radio-text">
        <span class="ega-radio-label">
          {#if option.icon}
            <span class="ega-radio-icon" aria-hidden="true">
              <Icon icon={option.icon} size={16} strokeWidth={1.75} />
            </span>
          {/if}
          <span>{option.label}</span>
        </span>
        {#if option.description}
          <span class="ega-radio-description">{option.description}</span>
        {/if}
      </span>
    </label>
  {/each}
</RadioGroup.Root>

<style>
  :global(.ega-radio-group) {
    display: flex;
    gap: var(--space-2);
    color: var(--color-fg);
    font-family: var(--font-ui);
  }
  :global(.ega-radio-group.orientation-vertical) {
    flex-direction: column;
  }
  :global(.ega-radio-group.orientation-horizontal) {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .ega-radio-row {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    line-height: 1.4;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .ega-radio-row:hover {
    background: var(--color-bg-hover);
  }
  .ega-radio-row.disabled {
    cursor: var(--cursor-disabled);
    color: var(--color-fg-disabled);
    background: transparent;
  }

  /* :global() because Item renders the <button> outside this component's
     scope-hash via bits-ui internals — unscoped selectors wouldn't match. */
  :global(.ega-radio-item) {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin: 2px 0 0;
    padding: 0;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 9999px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }
  :global(.ega-radio-item:hover:not(:disabled)) {
    border-color: var(--color-accent);
  }
  :global(.ega-radio-item:focus-visible) {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  :global(.ega-radio-item[data-state='checked']) {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  :global(.ega-radio-item:disabled) {
    background: var(--color-bg-disabled);
    border-color: var(--color-border-disabled);
    cursor: var(--cursor-disabled);
  }

  .ega-radio-dot {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: transparent;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .ega-radio-dot.checked {
    background: var(--color-accent-fg, white);
  }

  .ega-radio-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ega-radio-label {
    font-size: var(--fs-base);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .ega-radio-icon {
    display: inline-flex;
    align-items: center;
    color: var(--color-fg-subtle);
  }
  .ega-radio-description {
    font-size: var(--fs-sm);
    color: var(--color-fg-subtle);
  }
</style>
