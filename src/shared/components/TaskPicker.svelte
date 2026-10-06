<script lang="ts">
  import { RadioGroup } from 'bits-ui';
  import { SHIPPED_TASK_VIEWS, type TaskId, type TaskView } from '@/shared/task-view';
  import Check from '@lucide/svelte/icons/check';

  interface Props {
    task: TaskId;
    /** Every task, on or off, in list order; the current task shows even when it is off. */
    views?: readonly TaskView[] | undefined;
    /** Tasks that cannot run right now (an image is attached): they stay in the arrow order, marked, and a pick does nothing. */
    unavailable?: ReadonlySet<TaskId>;
  }

  let { task = $bindable(), views = SHIPPED_TASK_VIEWS, unavailable = new Set() }: Props = $props();

  const taskList = $derived(views.filter((v) => !v.disabled || v.id === task));

  const NAV_KEYS = new Set(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']);

  // The window handler would take the same arrow and move focus to a turn.
  function stopNavKeys(e: KeyboardEvent): void {
    if (NAV_KEYS.has(e.key)) e.stopPropagation();
  }
</script>

<div class="ega-task-picker" data-ega-task-picker>
  <RadioGroup.Root
    bind:value={
      () => task,
      (next) => {
        if (!unavailable.has(next)) task = next;
      }
    }
    orientation="horizontal"
    aria-label="Task"
    onkeydown={stopNavKeys}
  >
    {#snippet child({ props })}
      <div {...props} class="row">
        {#each taskList as v (v.id)}
          <RadioGroup.Item value={v.id} data-ega-task={v.id}>
            {#snippet child({ props: itemProps, checked })}
              <!-- The check, not only the colour, says which task is picked. -->
              <button
                {...itemProps}
                class="seg"
                class:active={checked}
                aria-disabled={unavailable.has(v.id) ? 'true' : undefined}
              >
                {#if checked}<Check size={16} aria-hidden="true" />{/if}{v.label}
              </button>
            {/snippet}
          </RadioGroup.Item>
        {/each}
      </div>
    {/snippet}
  </RadioGroup.Root>
</div>

<style>
  .ega-task-picker {
    display: flex;
    flex-direction: column;
    inline-size: 100%;
    box-sizing: border-box;
  }
  .row {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    inline-size: 100%;
  }
  .seg {
    /* Content-driven basis: `flex: 1 1 0` truncates every label at the popup's 360px. */
    flex: 0 1 auto;
    min-inline-size: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    box-sizing: border-box;
    min-block-size: 28px;
    padding: var(--space-1) var(--space-2);
    font-family: inherit;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    border: 1px solid var(--color-control-border);
    background: transparent;
    color: var(--color-fg);
    border-radius: var(--radius-md);
    cursor: pointer;
    white-space: nowrap;
  }
  .seg:hover:not(:disabled):not([aria-disabled='true']) {
    background: var(--color-bg-hover);
  }
  .seg:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .seg.active {
    /* The soft tint plus accent-hover text clears 4.5:1; a solid accent fill does not. */
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent-hover);
  }
  .seg[aria-disabled='true'] {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
</style>
