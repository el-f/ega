<script lang="ts">
  import { RadioGroup } from 'bits-ui';
  import { SHIPPED_TASK_VIEWS, type TaskId, type TaskView } from '@/shared/task-view';

  interface Props {
    task: TaskId;
    /** Every task, on or off, in list order; the current task shows even when it is off. */
    views?: readonly TaskView[] | undefined;
    /** `false` keeps the chips on one row for a parent that scrolls horizontally. */
    wrap?: boolean;
  }

  let { task = $bindable(), views = SHIPPED_TASK_VIEWS, wrap = true }: Props = $props();

  const taskList = $derived(views.filter((v) => !v.disabled || v.id === task));

  const NAV_KEYS = new Set(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']);

  // The window handler would take the same arrow and move focus to a turn.
  function stopNavKeys(e: KeyboardEvent): void {
    if (NAV_KEYS.has(e.key)) e.stopPropagation();
  }
</script>

<div class="ega-task-picker" data-ega-task-picker>
  <RadioGroup.Root
    bind:value={() => task, (next) => (task = next)}
    orientation="horizontal"
    aria-label="Task"
    onkeydown={stopNavKeys}
  >
    {#snippet child({ props })}
      <div {...props} class="row" class:nowrap={!wrap}>
        {#each taskList as v (v.id)}
          <RadioGroup.Item value={v.id} aria-label={`Task: ${v.label}`} data-ega-task={v.id}>
            {#snippet child({ props: itemProps, checked })}
              <button {...itemProps} class="seg" class:active={checked}>
                {v.label}
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
    gap: 6px;
    width: 100%;
    box-sizing: border-box;
  }
  .row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    width: 100%;
  }
  /* wrap=false: the parent's overflow-x container drives layout. */
  .row.nowrap {
    flex-wrap: nowrap;
    width: max-content;
  }
  .seg {
    /* Content-driven basis: `flex: 1 1 0` truncates every label at the popup's 360px. */
    flex: 0 1 auto;
    min-width: 0;
    padding: 4px 10px;
    font-size: 12px;
    line-height: 1.2;
    border: 1px solid var(--ega-border, var(--color-border));
    background: var(--ega-bg, transparent);
    color: inherit;
    border-radius: var(--radius-md);
    cursor: pointer;
    white-space: nowrap;
  }
  .seg:hover:not(:disabled) {
    background: var(--ega-hover, rgba(127, 127, 127, 0.15));
  }
  .seg.active {
    /* Border-only: a filled accent background lands at 4-4.4:1, borderline WCAG AA. */
    border: 2px solid var(--ega-active, var(--color-accent));
    padding: 3px 9px; /* compensate for +1px border on each side */
  }
</style>
