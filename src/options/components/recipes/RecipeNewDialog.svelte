<script lang="ts">
  import type { Task } from '@/shared/task-prompts';
  import { ALL_TASKS, TASK_LABELS } from '@/shared/task-prompts';
  import Button from '@/shared/ui/Button.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Textarea from '@/shared/ui/Textarea.svelte';
  import { debugCatch } from '@/shared/logger';

  interface Props {
    onClose: () => void;
    onSubmit: (label: string, description: string, task: Task) => Promise<void>;
    onSuccess: (label: string) => void;
  }

  const { onClose, onSubmit, onSuccess }: Props = $props();

  let label = $state('');
  let desc = $state('');
  let task = $state<Task>('translate');
  let error = $state<string | null>(null);

  async function submit(): Promise<void> {
    const l = label.trim();
    const d = desc.trim();
    if (l.length === 0) {
      error = 'Label is required.';
      return;
    }
    if (l.length > 80) {
      error = 'Label is too long (max 80 characters).';
      return;
    }
    if (d.length > 400) {
      error = 'Description is too long (max 400 characters).';
      return;
    }
    try {
      await onSubmit(l, d, task);
      onSuccess(l);
    } catch (e) {
      debugCatch(e, 'options.RecipesGallery.saveCurrentAs');
      error = e instanceof Error && e.message ? e.message : 'Could not save recipe.';
    }
  }
</script>

<Dialog open={true} title="New recipe from current" {onClose} size="md">
  {#snippet help()}
    Save one task's template, rules and generation settings as a recipe you can reuse. Pick the task
    below.
  {/snippet}
  {#snippet actions()}
    <Button variant="secondary" onclick={onClose}>Cancel</Button>
    <Button
      variant="primary"
      dataAttrs={{ 'data-ega-recipe-new-save': 'true' }}
      onclick={() => void submit()}
    >
      Save
    </Button>
  {/snippet}
  <div class="dialog-field">
    <Input
      label="Label"
      bind:value={label}
      placeholder="e.g. Less corporate"
      dataAttrs={{
        'data-ega-recipe-new-label': 'true',
        maxlength: 80,
      }}
    />
  </div>
  <div class="dialog-field">
    <Textarea
      label="Description"
      bind:value={desc}
      rows={3}
      maxlength={400}
      mono
      placeholder="A short note, so you recognize it later."
      dataAttrs={{ 'data-ega-recipe-new-desc': 'true' }}
    />
  </div>
  <label class="dialog-label" for="recipe-new-task">Task</label>
  <select id="recipe-new-task" class="dialog-input" data-ega-recipe-new-task bind:value={task}>
    {#each ALL_TASKS as t (t)}
      <option value={t}>{TASK_LABELS[t]}</option>
    {/each}
  </select>
  {#if error}
    <div class="dialog-error" role="alert">{error}</div>
  {/if}
</Dialog>

<style>
  .dialog-label {
    display: block;
    font-size: var(--fs-xs);
    margin: var(--space-2) 0 var(--space-1);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .dialog-field {
    margin-top: var(--space-2);
  }
  .dialog-input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-fg);
    font-size: var(--fs-sm);
  }
  .dialog-input:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  .dialog-error {
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--color-danger-fg);
  }
</style>
