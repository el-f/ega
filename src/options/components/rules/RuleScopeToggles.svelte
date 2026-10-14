<script lang="ts">
  /** "Applies to": All tasks, or the tasks picked. Turning the last task off turns All tasks back on. */
  import Check from '@lucide/svelte/icons/check';
  import { taskExists, type TaskView } from '@/shared/task-view';

  interface Props {
    /** Empty means every task. */
    tasks: readonly string[];
    taskViews: readonly TaskView[];
    labelId: string;
    onchange: (tasks: string[]) => void;
  }

  const { tasks, taskViews, labelId, onchange }: Props = $props();

  const all = $derived(tasks.length === 0);
  // A task deleted since the rule was made still limits it; it stays pressed until turned off.
  const gone = $derived(tasks.filter((t) => !taskExists(taskViews, t)));

  function toggle(id: string): void {
    onchange(tasks.includes(id) ? tasks.filter((t) => t !== id) : [...tasks, id]);
  }
</script>

<div class="scope" role="group" aria-labelledby={labelId}>
  <button
    type="button"
    class="scope-btn"
    aria-pressed={all}
    data-ega-rule-scope-all
    onclick={() => {
      if (!all) onchange([]);
    }}
  >
    {#if all}<Check size={14} aria-hidden="true" />{/if}All tasks
  </button>
  {#each taskViews as v (v.id)}
    {@const on = tasks.includes(v.id)}
    <button
      type="button"
      class="scope-btn"
      aria-pressed={on}
      data-ega-rule-scope-task={v.id}
      onclick={() => toggle(v.id)}
    >
      {#if on}<Check size={14} aria-hidden="true" />{/if}{v.label}
    </button>
  {/each}
  {#each gone as id (id)}
    <button
      type="button"
      class="scope-btn"
      aria-pressed="true"
      data-ega-rule-scope-task={id}
      onclick={() => toggle(id)}
    >
      <Check size={14} aria-hidden="true" />Deleted task
    </button>
  {/each}
</div>

<style>
  .scope {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .scope-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font: inherit;
    font-size: var(--fs-base);
    cursor: pointer;
  }
  .scope-btn:hover {
    background: var(--color-bg-hover);
  }
  .scope-btn[aria-pressed='true'] {
    background: var(--color-accent-bg-soft);
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }
  .scope-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
