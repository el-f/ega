<script lang="ts" generics="T extends string">
  /** Pick one of 2-5 short choices: a radio group (arrows move and select), sized to its content. */
  import { RadioGroup } from 'bits-ui';

  interface Option {
    value: T;
    label: string;
  }

  interface Props {
    value: T;
    options: readonly Option[];
    onchange: (next: T) => void;
    /** Name of the group when no visible label points at it. */
    ariaLabel?: string;
    ariaLabelledby?: string;
    /** Id of a visible line that describes the group (a hint or a note). */
    describedBy?: string;
    /** Data attribute set on each choice to its value, for tests and deep links (e.g. "data-ega-effort-value"). */
    itemAttr?: string;
    dataAttrs?: Record<string, string | number | boolean | undefined>;
  }

  let {
    value,
    options,
    onchange,
    ariaLabel,
    ariaLabelledby,
    describedBy,
    itemAttr,
    dataAttrs,
  }: Props = $props();
</script>

<RadioGroup.Root
  bind:value={() => value, (next) => onchange(next as T)}
  orientation="horizontal"
  aria-label={ariaLabel}
  aria-labelledby={ariaLabelledby}
  aria-describedby={describedBy}
  {...dataAttrs ?? {}}
>
  {#snippet child({ props })}
    <div {...props} class="ega-segmented">
      {#each options as option (option.value)}
        <RadioGroup.Item value={option.value} {...itemAttr ? { [itemAttr]: option.value } : {}}>
          {#snippet child({ props: itemProps, checked })}
            <button {...itemProps} class="ega-segmented-item" class:active={checked}>
              {option.label}
            </button>
          {/snippet}
        </RadioGroup.Item>
      {/each}
    </div>
  {/snippet}
</RadioGroup.Root>

<style>
  .ega-segmented {
    display: inline-flex;
    flex-wrap: wrap;
    align-self: flex-start;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .ega-segmented-item {
    min-height: 26px;
    min-width: 24px;
    background: transparent;
    color: var(--color-muted);
    border: 1px solid transparent;
    padding: 0 var(--space-3);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    font-weight: 400;
    line-height: 1;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  .ega-segmented-item.active {
    background: var(--color-accent-bg-soft);
    color: var(--color-fg);
    box-shadow: inset 0 0 0 1px var(--color-accent);
    font-weight: 600;
  }
  .ega-segmented-item:hover:not(.active) {
    color: var(--color-fg);
  }
  .ega-segmented-item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .ega-segmented-item {
      transition: none;
    }
  }
</style>
