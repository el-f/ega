<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import Trash from '@lucide/svelte/icons/trash-2';
  import type { PromptTemplate, Settings, Variety } from '@/shared/types';
  import {
    CUSTOM_TASK_LABEL_MAX,
    EFFORT_LEVELS,
    type CustomTask,
    type TaskEffort,
  } from '@/shared/settings-schema';
  import { EFFORT_LABEL } from '@/options/effort-labels';
  import {
    addCustomTask,
    deleteCustomTask,
    restoreCustomTask,
    restoreMenuItems,
    setTaskInMenu,
    taskInMenu,
    updateCustomTask,
    type CustomTaskInput,
  } from '@/shared/tasks';
  import { CARD_CONTRACT, PLAIN_CONTRACT } from '@/shared/prompts';
  import { listVarieties } from '@/shared/varieties';
  import { buildCustomPreviewPrompt, PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
  import { reportSaveFailure, saveFailureReason } from '@/options/storage-with-toast';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import PromptEditor from '@/options/components/prompt/PromptEditor.svelte';
  import { checkPrompt } from '@/options/components/prompt/prompt-checks';
  import DialogStatus from '@/options/components/DialogStatus.svelte';
  import { createDialogSaver } from '@/options/components/dialog-saver.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import Segmented from '@/shared/ui/Segmented.svelte';
  import { id as makeId } from '@/shared/uuid';

  interface Props {
    s: Settings;
    /** The row being edited; absent for a new task. */
    row?: CustomTask | undefined;
    onClose: () => void;
    /** Null when only the task list changed. */
    onSaved: (next: Settings | null) => void;
  }

  const { s, row, onClose, onSaved }: Props = $props();

  const uid = makeId('ega-custom-task');
  const DEFAULT_USER = 'TEXT:\n"""\n{{text}}\n"""';

  // The form edits a copy: a row change from another window must not overwrite what the user is typing.
  const initial = untrack(() => row);
  let rowId = $state<string | null>(initial?.id ?? null);
  let label = $state(initial?.label ?? '');
  let prompt = $state<PromptTemplate>({
    system: initial?.system ?? '',
    user: initial?.user ?? DEFAULT_USER,
  });
  let output = $state<'plain' | 'card'>(initial?.output ?? 'plain');
  let effort = $state<'' | TaskEffort>(initial?.effort ?? '');
  let pageContext = $state(initial?.pageContext ?? false);
  let image = $state(initial?.image ?? false);
  let glossary = $state(initial?.glossary ?? false);
  let inMenu = $state(untrack(() => (initial ? taskInMenu(s, initial.id) : false)));
  let gone = $state(false);

  const saver = createDialogSaver();
  onDestroy(() => saver.dispose());

  let varieties = $state.raw<Variety[]>([]);
  void listVarieties({ enabledOnly: false }).then((vs) => (varieties = vs));

  const draft = $derived<CustomTaskInput>({
    label: label.trim(),
    system: prompt.system,
    user: prompt.user,
    output,
    pageContext,
    image,
    glossary,
    ...(effort !== '' ? { effort } : {}),
  });
  const taskKey = $derived(rowId ?? 'custom');
  const messageError = $derived(checkPrompt(prompt, 'custom', taskKey).messageError);
  /** Why the draft cannot be saved, in the words the status line uses; null when it can. */
  const blocker = $derived(
    label.trim() === ''
      ? 'add a name'
      : messageError !== null
        ? 'the message needs the Selected text variable'
        : null,
  );

  const ERRORS: Record<string, string> = {
    'cap-reached': 'You have the most tasks Ega keeps. Delete one to add another.',
    'invalid-task': 'the name or the prompt is not valid',
  };
  function reasonOf(e: unknown): string {
    const code = e instanceof Error ? e.message : '';
    return ERRORS[code] ?? saveFailureReason(e).message;
  }

  // One create at a time: a second edit while the first save runs waits for the row id.
  let creating: Promise<string> | null = null;
  async function writeRow(input: CustomTaskInput): Promise<void> {
    if (rowId === null) {
      creating ??= addCustomTask(input).then(async (created) => {
        rowId = created.id;
        if (inMenu) onSaved((await setTaskInMenu(created.id, true)).settings);
        return created.id;
      });
      try {
        await creating;
      } finally {
        creating = null;
      }
      onSaved(null);
      return;
    }
    try {
      await updateCustomTask(rowId, input);
    } catch (e) {
      if (e instanceof Error && e.message === 'task-gone') gone = true;
      throw new Error(reasonOf(e), { cause: e });
    }
    onSaved(null);
  }

  function save(field: 'text' | 'toggle'): void {
    if (blocker !== null) {
      if (rowId === null && label.trim() === '') return; // the idle line already says "add a name"
      saver.invalid('row', blocker);
      return;
    }
    const input = draft;
    if (field === 'text') saver.later('row', () => writeRow(input));
    else void saver.now(() => writeRow(input));
  }

  // Each control writes the whole row through save(); typing waits for the pause.
  function setLabel(v: string): void {
    label = v;
    save('text');
  }
  function setPrompt(next: PromptTemplate): void {
    prompt = next;
    save('text');
  }

  async function setMenu(on: boolean): Promise<void> {
    inMenu = on;
    if (rowId === null) return;
    const id = rowId;
    await saver.now(async () => {
      const { settings, removed } = await setTaskInMenu(id, on);
      onSaved(settings);
      if (!on && removed.length > 0) {
        saver.note('Removed from the right-click menu', () => {
          inMenu = true;
          void saver.now(async () => onSaved(await restoreMenuItems(removed)));
        });
      }
    });
  }

  async function remove(): Promise<void> {
    if (rowId === null) return;
    const name = label.trim() || (initial?.label ?? '');
    saver.dispose();
    const out = await deleteCustomTask(rowId).catch((e: unknown) => {
      saver.invalid('row', reasonOf(e));
      return null;
    });
    if (out === null) return;
    // Read before onClose: the props of an unmounted component are gone by the time Undo runs.
    const saved = onSaved;
    saved(out.settings);
    onClose();
    const deleted = out.deleted;
    toastStore.push({
      message: `Deleted "${name}"`,
      variant: 'success',
      ...(deleted
        ? {
            action: {
              label: 'Undo',
              onClick: () =>
                void restoreCustomTask(deleted)
                  .then((next) => saved(next))
                  .catch((e: unknown) => reportSaveFailure(e)),
            },
          }
        : {}),
    });
  }

  const hasText = $derived(
    label.trim() !== '' || prompt.system.trim() !== '' || prompt.user !== DEFAULT_USER,
  );
  let closing = false;
  async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    try {
      await saver.flush();
      if (rowId === null && hasText) {
        const discard = await confirmDialog({
          title: 'Discard this task?',
          body: 'You started a task and it is not saved yet.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep editing',
          danger: true,
        });
        if (!discard) return;
      } else if (rowId !== null && blocker !== null && !gone) {
        const leave = await confirmDialog({
          title: 'Close without this change?',
          body: `Your last change is not valid, so it was not saved: ${blocker}.`,
          confirmLabel: 'Close anyway',
          cancelLabel: 'Keep editing',
        });
        if (!leave) return;
      }
      onClose();
    } finally {
      closing = false;
    }
  }

  function preview(tpl: PromptTemplate): { system: string; user: string } {
    return buildCustomPreviewPrompt(s, {
      id: taskKey,
      row: { ...draft, system: tpl.system, user: tpl.user },
      text: PREVIEW_SAMPLE_TEXT,
      sourceLang: 'auto',
      targetLang: s.defaultTargetLang ?? 'en',
      varieties,
    });
  }

  const effortOptions = $derived([
    { value: '' as const, label: 'Default' },
    ...EFFORT_LEVELS.map((e) => ({ value: e, label: EFFORT_LABEL[e] })),
  ]);
  const idleText = $derived(rowId === null ? 'Not saved yet: add a name' : '');
</script>

<Dialog
  open
  title={initial ? `Edit ${initial.label}` : 'New task'}
  focusTitle
  onClose={() => void close()}
  size="lg"
>
  <div class="custom-task" data-ega-custom-task-dialog>
    {#if gone}
      <div class="ct-gone" role="alert">
        <span>This task was deleted in another window</span>
        <Button variant="secondary" onclick={onClose}>Close</Button>
      </div>
    {/if}
    <div class="ct-grid">
      <label class="ct-label" for="{uid}-name">Name</label>
      <Input
        id="{uid}-name"
        value={label}
        maxlength={CUSTOM_TASK_LABEL_MAX}
        dataAttrs={{ 'data-ega-custom-task-name': true }}
        oninput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)}
      />

      <span class="ct-label" id="{uid}-answers">Answers</span>
      <RadioGroup
        value={output}
        options={[
          { value: 'plain', label: 'Answer only' },
          { value: 'card', label: 'Answer with notes' },
        ]}
        onValueChange={(v) => {
          output = v === 'card' ? 'card' : 'plain';
          save('toggle');
        }}
        orientation="horizontal"
        dataAttrs={{ 'data-ega-custom-task-output': true, 'aria-labelledby': `${uid}-answers` }}
      />

      <span class="ct-label" id="{uid}-effort">Effort</span>
      <div class="ct-control" data-ega-custom-task-effort>
        <Segmented
          value={effort}
          options={effortOptions}
          ariaLabelledby="{uid}-effort"
          describedBy="{uid}-effort-hint"
          itemAttr="data-ega-effort-value"
          onchange={(v) => {
            effort = v;
            save('toggle');
          }}
        />
        <p class="ct-hint" id="{uid}-effort-hint" data-ega-hint>
          Default is {EFFORT_LABEL[s.advanced.effort]}, the Effort on the Answers tab
        </p>
      </div>

      <span class="ct-label" id="{uid}-inputs">Inputs</span>
      <div class="ct-control" role="group" aria-labelledby="{uid}-inputs">
        <Checkbox
          label="Send page context"
          bind:checked={pageContext}
          inputAttrs={{ 'data-ega-custom-task-page-context': true }}
          onchange={() => save('toggle')}
        />
        <Checkbox
          label="Reads images"
          bind:checked={image}
          inputAttrs={{ 'data-ega-custom-task-image': true }}
          onchange={() => save('toggle')}
        />
        <Checkbox
          label="Use glossary"
          bind:checked={glossary}
          inputAttrs={{ 'data-ega-custom-task-glossary': true }}
          onchange={() => save('toggle')}
        />
        <Checkbox
          label="Show in right-click menu"
          checked={inMenu}
          inputAttrs={{ 'data-ega-custom-task-menu': true }}
          onchange={(on) => void setMenu(on)}
        />
      </div>
    </div>

    <div class="ct-prompt">
      <PromptEditor
        kind="custom"
        task={taskKey}
        template={prompt}
        builtIn={null}
        format={output === 'card' ? CARD_CONTRACT : PLAIN_CONTRACT}
        snippets={{}}
        sendsPageContext={pageContext}
        onChange={setPrompt}
        buildPreview={preview}
      />
    </div>
  </div>
  {#snippet actions()}
    <span class="ct-foot-start">
      {#if rowId !== null}
        <Button
          variant="ghost"
          leadingIcon={Trash}
          dataAttrs={{ 'data-ega-custom-task-delete': true }}
          onclick={() => void remove()}>Delete task</Button
        >
      {/if}
      <DialogStatus status={saver.status} {idleText} />
    </span>
    <Button onclick={() => void close()} dataAttrs={{ 'data-ega-dialog-done': true }}>Done</Button>
  {/snippet}
</Dialog>

<style>
  .custom-task {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .ct-grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3) var(--space-4);
  }
  .ct-label {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .ct-control {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  .ct-hint {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .ct-prompt {
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
  }
  .ct-gone {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-danger-fg);
    border-radius: var(--radius-md);
    color: var(--color-danger-fg);
    font-size: var(--fs-base);
  }
  .ct-gone span {
    flex: 1 1 16rem;
  }
  .ct-foot-start {
    margin-inline-end: auto;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  @container options (max-width: 600px) {
    .ct-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
