<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Settings, Variety } from '@/shared/types';
  import {
    CUSTOM_TASK_LABEL_MAX,
    EFFORT_LEVELS,
    TEMPLATE_MAX,
    type CustomTask,
    type TaskEffort,
  } from '@/shared/settings-schema';
  import { validateAgainstSlots } from '@/shared/slot-registry';
  import { EFFORT_LABEL } from '@/options/components/EffortSegmented.svelte';
  import {
    addCustomTask,
    deleteCustomTask,
    updateCustomTask,
    type CustomTaskInput,
  } from '@/shared/tasks';
  import { listVarieties } from '@/shared/varieties';
  import { buildCustomPreviewPrompt } from '@/options/preview-prompt';
  import { saveVia } from '@/options/storage-with-toast';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Textarea from '@/shared/ui/Textarea.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';

  interface Props {
    s: Settings;
    /** The row being edited; absent for a new task. */
    row?: CustomTask | undefined;
    onClose: () => void;
    onSaved: (next: Settings | null) => void;
  }

  const { s, row, onClose, onSaved }: Props = $props();

  const INSERTS = ['text', 'targetLangLabel', 'langLabel', 'tone', 'context'] as const;

  // The form edits a copy: a row change from another window must not overwrite what the user is typing.
  const initial = untrack(() => row);
  let label = $state(initial?.label ?? '');
  let system = $state(initial?.system ?? '');
  let user = $state(initial?.user ?? 'TEXT:\n"""\n{{text}}\n"""');
  let output = $state<'plain' | 'card'>(initial?.output ?? 'plain');
  let effort = $state<string>(initial?.effort ?? '');
  let pageContext = $state(initial?.pageContext ?? false);
  let image = $state(initial?.image ?? false);
  let glossary = $state(initial?.glossary ?? false);
  let previewShown = $state(false);
  let saving = $state(false);
  let varieties = $state.raw<Variety[]>([]);
  let saveError = $state<string | null>(null);
  const start = untrack(() => ({
    label,
    system,
    user,
    output,
    effort,
    pageContext,
    image,
    glossary,
  }));
  const dirty = $derived(
    label !== start.label ||
      system !== start.system ||
      user !== start.user ||
      output !== start.output ||
      effort !== start.effort ||
      pageContext !== start.pageContext ||
      image !== start.image ||
      glossary !== start.glossary,
  );

  // Escape, the x, a click outside and Cancel all close, and the form lives only here.
  async function close(): Promise<void> {
    if (dirty) {
      const discard = await confirmDialog({
        title: row ? 'Discard your changes?' : 'Discard this task?',
        body: row
          ? 'You changed this task and did not save it. Close anyway?'
          : 'You started a task and did not save it. Close anyway?',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
  }

  onMount(() => {
    void listVarieties({ enabledOnly: false }).then((vs) => {
      varieties = vs;
    });
  });

  const draft = $derived<CustomTaskInput>({
    label: label.trim(),
    system,
    user,
    output,
    pageContext,
    image,
    glossary,
    ...(effort !== '' ? { effort: effort as TaskEffort } : {}),
  });
  const check = $derived(validateAgainstSlots({ system, user }, row?.id ?? 'custom'));
  const canSave = $derived(draft.label.length > 0 && check.ok);

  const effortOptions = $derived([
    { value: '', label: `Default (${EFFORT_LABEL[s.advanced.effort]})` },
    ...EFFORT_LEVELS.map((e) => ({ value: e, label: EFFORT_LABEL[e] })),
  ]);

  function insert(slot: string): void {
    user = `${user}{{${slot}}}`;
  }

  // Follows the draft while shown, so it never shows a prompt the user has since changed.
  const preview = $derived(
    previewShown
      ? buildCustomPreviewPrompt(s, {
          id: row?.id ?? 'custom',
          row: draft,
          text: 'Hello world (sample text for preview).',
          sourceLang: 'auto',
          targetLang: s.defaultTargetLang ?? 'en',
          varieties,
        })
      : null,
  );
  const contextUnused = $derived(
    !pageContext && (system.includes('{{context}}') || user.includes('{{context}}')),
  );

  const ERRORS: Record<string, string> = {
    'cap-reached': 'You have the most custom tasks Ega keeps. Delete one first.',
    'task-gone': 'This task was deleted in another window.',
    'invalid-task': 'Check the name and the message: the message must contain {{text}}.',
  };

  async function save(): Promise<void> {
    if (saving) return;
    saving = true;
    saveError = null;
    try {
      if (row) await updateCustomTask(row.id, draft);
      else await addCustomTask(draft);
      onSaved(null);
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      saveError = ERRORS[code] ?? `Not saved: ${code}`;
    } finally {
      saving = false;
    }
  }

  async function remove(): Promise<void> {
    if (!row) return;
    const ok = await confirmDialog({
      title: `Delete "${row.label}"?`,
      body: 'Right-click items that run it are removed. Rules scoped only to it stop applying. Past answers stay in your conversations.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const next = await saveVia(() => deleteCustomTask(row.id));
    if (!next) return;
    onSaved(next);
    onClose();
    toastStore.push({ message: `Deleted "${row.label}".`, variant: 'success' });
  }
</script>

<Dialog open title={row ? `Edit ${row.label}` : 'New task'} onClose={close} size="lg">
  <div class="custom-task" data-ega-custom-task-dialog>
    <Input
      label="Name"
      bind:value={label}
      maxlength={CUSTOM_TASK_LABEL_MAX}
      dataAttrs={{ 'data-ega-custom-task-name': true }}
    />
    <Textarea
      label="Instructions"
      bind:value={system}
      rows={4}
      mono
      maxlength={TEMPLATE_MAX}
      dataAttrs={{ 'data-ega-custom-task-system': true }}
    />
    <Textarea
      label={'Message (must contain {{text}})'}
      bind:value={user}
      rows={3}
      mono
      maxlength={TEMPLATE_MAX}
      dataAttrs={{ 'data-ega-custom-task-user': true }}
    />
    <div class="custom-task-inserts" role="group" aria-label="Insert a variable">
      <span>Insert:</span>
      {#each INSERTS as slot (slot)}
        <Button variant="ghost" size="sm" onclick={() => insert(slot)}>{`{{${slot}}}`}</Button>
      {/each}
    </div>
    {#each check.errors as e (e.message)}
      <p class="custom-task-error" role="alert">{e.message}</p>
    {/each}
    {#each check.warnings as w (w.message)}
      <p class="custom-task-warning">{w.message}. It will be empty.</p>
    {/each}
    {#if contextUnused}
      <p class="custom-task-warning">
        {'{{context}}'} is empty unless Send page context is on.
      </p>
    {/if}
    <div class="custom-task-row">
      <span class="custom-task-label">Answer</span>
      <RadioGroup
        value={output}
        options={[
          { value: 'plain', label: 'Answer only' },
          { value: 'card', label: 'Answer with notes' },
        ]}
        onValueChange={(v) => (output = v === 'card' ? 'card' : 'plain')}
        orientation="horizontal"
        dataAttrs={{ 'data-ega-custom-task-output': true, 'aria-label': 'Answer' }}
      />
    </div>
    <div data-ega-custom-task-effort>
      <Select
        label="Effort"
        size="sm"
        value={effort}
        options={effortOptions}
        onchange={(v) => (effort = v)}
      />
    </div>
    <fieldset class="custom-task-inputs">
      <legend>Inputs</legend>
      <Checkbox
        label="Send page context"
        bind:checked={pageContext}
        inputAttrs={{ 'data-ega-custom-task-page-context': true }}
      />
      <Checkbox
        label="Accept images"
        bind:checked={image}
        inputAttrs={{ 'data-ega-custom-task-image': true }}
      />
      <Checkbox
        label="Use glossary"
        bind:checked={glossary}
        inputAttrs={{ 'data-ega-custom-task-glossary': true }}
      />
    </fieldset>
    <div>
      <Button
        variant="secondary"
        size="sm"
        dataAttrs={{ 'data-ega-custom-task-preview': true }}
        onclick={() => (previewShown = true)}>Preview prompt</Button
      >
    </div>
    {#if preview}
      <pre class="custom-task-preview" data-ega-custom-task-preview-system>{preview.system}</pre>
      <pre class="custom-task-preview" data-ega-custom-task-preview-user>{preview.user}</pre>
    {/if}
    {#if saveError}
      <p class="custom-task-error" role="alert">{saveError}</p>
    {/if}
  </div>
  {#snippet actions()}
    {#if row}
      <Button
        variant="danger"
        dataAttrs={{ 'data-ega-custom-task-delete': true }}
        onclick={() => void remove()}>Delete</Button
      >
    {/if}
    <Button variant="secondary" onclick={() => void close()}>Cancel</Button>
    <Button
      disabled={!canSave}
      loading={saving}
      dataAttrs={{ 'data-ega-custom-task-save': true }}
      onclick={() => void save()}>Save</Button
    >
  {/snippet}
</Dialog>

<style>
  .custom-task {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .custom-task-inserts,
  .custom-task-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--fs-sm);
  }
  .custom-task-label {
    font-weight: 500;
    margin-right: var(--space-2);
  }
  .custom-task-error {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-danger);
  }
  .custom-task-warning {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-warning);
  }
  .custom-task-inputs {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .custom-task-inputs legend {
    padding: 0;
    margin-bottom: var(--space-1);
    font-size: var(--fs-sm);
    font-weight: 500;
  }
  .custom-task-preview {
    margin: 0;
    padding: var(--space-2);
    max-height: 200px;
    overflow: auto;
    white-space: pre-wrap;
    font-size: var(--fs-xs);
    background: var(--color-bg-sunken);
    border-radius: var(--radius-sm);
  }
</style>
