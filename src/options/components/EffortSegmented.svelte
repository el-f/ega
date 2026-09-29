<script lang="ts">
  import { RadioGroup } from 'bits-ui';

  type Effort = 'low' | 'medium' | 'high';

  interface Props {
    value: Effort;
    onchange: (next: Effort) => void;
    ariaLabel: string;
  }

  let { value, onchange, ariaLabel }: Props = $props();

  const OPTIONS: ReadonlyArray<{ id: Effort; label: string }> = [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
  ];
</script>

<RadioGroup.Root
  bind:value={() => value, (next) => onchange(next as Effort)}
  orientation="horizontal"
  aria-label={ariaLabel}
>
  {#snippet child({ props })}
    <div {...props} class="effort-seg">
      {#each OPTIONS as opt (opt.id)}
        <RadioGroup.Item value={opt.id} data-ega-effort-value={opt.id}>
          {#snippet child({ props: itemProps, checked })}
            <button {...itemProps} class:active={checked}>
              {opt.label}
            </button>
          {/snippet}
        </RadioGroup.Item>
      {/each}
    </div>
  {/snippet}
</RadioGroup.Root>

<style>
  .effort-seg {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .effort-seg button {
    background: transparent;
    color: var(--color-muted);
    border: 0;
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    line-height: 1;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  .effort-seg button.active {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .effort-seg button:hover:not(.active) {
    color: var(--color-fg);
  }
  .effort-seg button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
</style>
