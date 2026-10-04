<script lang="ts">
  import { detectCategory, ruleCategoryLabel } from '@/shared/rules';
  import { SHIPPED_TASK_VIEWS, type TaskId, type TaskView } from '@/shared/task-view';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Textarea from '@/shared/ui/Textarea.svelte';
  import { RULE_BODY_MAX } from '@/shared/settings-schema';
  import Plus from '@lucide/svelte/icons/plus';

  interface Props {
    onSubmit: (payload: {
      body: string;
      tasks: readonly TaskId[];
      sites: readonly string[];
    }) => void | Promise<void>;
    /** Every task, on or off, custom ones included. */
    taskViews?: readonly TaskView[];
    /** The form's disclosure; the empty state opens it. */
    open?: boolean;
  }

  let { onSubmit, taskViews = SHIPPED_TASK_VIEWS, open = $bindable(false) }: Props = $props();

  let manualBody = $state('');
  let manualTasks = $state<TaskId[]>([]);
  let manualSites = $state('');

  function parseSites(raw: string): string[] {
    return [
      ...new Set(
        raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      ),
    ];
  }

  function toggleManualTask(task: TaskId): void {
    manualTasks = manualTasks.includes(task)
      ? manualTasks.filter((t) => t !== task)
      : [...manualTasks, task];
  }

  function reset(): void {
    manualBody = '';
    manualTasks = [];
    manualSites = '';
  }

  function cancel(): void {
    reset();
    open = false;
  }

  async function submit(): Promise<void> {
    const body = manualBody.trim();
    if (body.length === 0) return;
    await onSubmit({ body, tasks: [...manualTasks], sites: parseSites(manualSites) });
    reset();
  }
</script>

<details class="manual-block" bind:open>
  <summary class="manual-summary">
    <Plus size={14} aria-hidden="true" />
    <span>Add a rule</span>
  </summary>
  <div class="manual-form">
    <Textarea
      label="Rule text"
      rows={2}
      maxlength={RULE_BODY_MAX}
      bind:value={manualBody}
      placeholder="Always preserve URLs."
      dataAttrs={{ 'data-ega-manual-body': 'true' }}
    />
    {#if manualBody.trim().length > 0}
      <p class="category-guess">
        Category: {ruleCategoryLabel(detectCategory(manualBody))} (guessed from the text; you can change
        it after adding)
      </p>
    {/if}
    <div class="form-row">
      <span class="form-label">Applies to</span>
      <div class="task-chip-row" role="group" aria-label="Tasks">
        {#each taskViews as v (v.id)}
          {@const t = v.id}
          {@const active = manualTasks.includes(t)}
          <Button
            variant={active ? 'primary' : 'secondary'}
            size="sm"
            extraClass="task-chip"
            dataAttrs={{
              'data-ega-manual-task': t,
              'aria-pressed': active ? 'true' : 'false',
            }}
            onclick={() => toggleManualTask(t)}
          >
            {v.label}
          </Button>
        {/each}
      </div>
      <p class="field-hint">Pick none to apply the rule to all tasks.</p>
    </div>
    <Input
      label="Sites (optional, separated by commas)"
      bind:value={manualSites}
      placeholder="twitter.com, example.com"
      dataAttrs={{ 'data-ega-manual-sites': 'true' }}
    />
    <div class="form-actions">
      {#if manualBody.trim().length === 0}
        <span class="field-hint">Write the rule text to add it.</span>
      {/if}
      <Button variant="ghost" onclick={cancel}>Cancel</Button>
      <Button
        variant="primary"
        disabled={manualBody.trim().length === 0}
        dataAttrs={{ 'data-ega-manual-submit': 'true' }}
        onclick={() => void submit()}
      >
        Add rule
      </Button>
    </div>
  </div>
</details>

<style>
  .manual-block {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elevated);
  }
  .manual-summary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    font-size: var(--fs-sm);
    color: var(--color-fg);
    user-select: none;
  }
  .manual-summary:hover {
    color: var(--color-accent);
  }
  .manual-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border-top: 1px solid var(--color-border);
  }
  .form-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .form-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    font-weight: 500;
  }
  .category-guess,
  .field-hint {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .task-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .task-chip-row :global(.ega-btn.task-chip) {
    border-radius: var(--radius-pill);
    padding: 2px var(--space-2);
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-2);
  }
</style>
