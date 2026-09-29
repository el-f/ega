<script lang="ts">
  import { ALL_TASKS, TASK_LABELS, type Task } from '@/shared/task-prompts';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Textarea from '@/shared/ui/Textarea.svelte';
  import { RULE_BODY_MAX } from '@/shared/settings-schema';
  import Plus from '@lucide/svelte/icons/plus';

  interface Props {
    onSubmit: (payload: {
      body: string;
      tasks: readonly Task[];
      sites: readonly string[];
    }) => void | Promise<void>;
  }

  const { onSubmit }: Props = $props();

  let manualOpen = $state(false);
  let manualBody = $state('');
  let manualTasks = $state<Task[]>([]);
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

  function toggleManualTask(task: Task): void {
    manualTasks = manualTasks.includes(task)
      ? manualTasks.filter((t) => t !== task)
      : [...manualTasks, task];
  }

  async function submit(): Promise<void> {
    const body = manualBody.trim();
    if (body.length === 0) return;
    await onSubmit({ body, tasks: [...manualTasks], sites: parseSites(manualSites) });
    manualBody = '';
    manualTasks = [];
    manualSites = '';
  }
</script>

<details class="manual-block" bind:open={manualOpen}>
  <summary class="manual-summary">
    <Plus size={14} aria-hidden="true" />
    <span>Add rule manually</span>
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
    <div class="form-row">
      <span class="form-label">Tasks (empty = all)</span>
      <div class="task-chip-row" role="group" aria-label="Tasks">
        {#each ALL_TASKS as t (t)}
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
            {TASK_LABELS[t]}
          </Button>
        {/each}
      </div>
    </div>
    <Input
      label="Sites (comma-separated, optional)"
      bind:value={manualSites}
      placeholder="twitter.com, example.com"
      dataAttrs={{ 'data-ega-manual-sites': 'true' }}
    />
    <div class="form-actions">
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
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
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
  }
</style>
