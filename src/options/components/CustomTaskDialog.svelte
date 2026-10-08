<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import Trash from '@lucide/svelte/icons/trash-2';
  import type { PromptTemplate, Settings, Variety } from '@/shared/types';
  import {
    CONTEXT_MENU_ITEMS_MAX,
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
    patchCustomTask,
    taskInMenu,
    type CustomTaskInput,
    type CustomTaskPatch,
  } from '@/shared/tasks';
  import { CARD_CONTRACT, PLAIN_CONTRACT } from '@/shared/prompts';
  import { listVarieties } from '@/shared/varieties';
  import { buildCustomPreviewPrompt, PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
  import { reportSaveFailure } from '@/options/storage-with-toast';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import PromptEditor from '@/options/components/prompt/PromptEditor.svelte';
  import { checkPrompt } from '@/options/components/prompt/prompt-checks';
  import DialogStatus from '@/options/components/DialogStatus.svelte';
  import {
    confirmCloseWithout,
    createDialogSaver,
    NotSavedError,
  } from '@/options/components/dialog-saver.svelte';
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
    /** After the Undo of a delete put the task back. */
    onRestored?: (id: string) => void;
  }

  const { s, row, onClose, onSaved, onRestored }: Props = $props();

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

  type TextField = 'label' | 'prompt';
  /** Why a text field cannot be saved as typed, in the status line's words; null when it can. */
  function problemOf(field: TextField): string | null {
    if (field === 'label') return label.trim() === '' ? 'add a name' : null;
    return messageError !== null ? 'the message needs the Selected text variable' : null;
  }
  /** What a new task still needs before it is created; null once it can be. */
  const blocker = $derived(problemOf('label') ?? problemOf('prompt'));
  const FIELD_NAMES: Record<TextField, string> = { label: 'the name', prompt: 'the message' };

  const ERRORS: Record<string, string> = {
    'cap-reached': 'you have the most tasks Ega keeps; delete one to add another',
    'invalid-task': 'the name or the prompt is not valid',
    'task-gone': 'it was deleted in another window',
  };
  function reasonOf(e: unknown): string | undefined {
    return e instanceof Error ? ERRORS[e.message] : undefined;
  }
  /** A named reason reads in the footer; anything else is a storage failure the saver words. */
  function named(e: unknown): unknown {
    const known = reasonOf(e);
    return known === undefined ? e : new NotSavedError(known, { cause: e });
  }

  // The first valid save creates the row from the whole draft, once; every later change writes only its own field.
  let creating: Promise<void> | null = null;
  async function create(): Promise<void> {
    if (rowId !== null) return;
    creating ??= (async () => {
      if (blocker !== null) throw new NotSavedError(blocker);
      const created = await addCustomTask(draft).catch((e: unknown) => {
        throw named(e);
      });
      rowId = created.id;
      if (inMenu) onSaved((await setTaskInMenu(created.id, true)).settings);
      onSaved(null);
    })();
    try {
      await creating;
    } finally {
      creating = null;
    }
  }

  function write(patch: CustomTaskPatch): () => Promise<void> {
    return async () => {
      // A change made while the first create runs waits for its row, then writes itself.
      if (rowId === null && creating !== null) await creating;
      const id = rowId;
      if (id === null) return;
      try {
        await patchCustomTask(id, patch);
      } catch (e) {
        if (e instanceof Error && e.message === 'task-gone') gone = true;
        throw named(e);
      }
      onSaved(null);
    };
  }

  /** A new task waits until it has a name and a valid message; the idle line says what it needs. */
  const startsRow = (): boolean => rowId === null && creating === null;

  /** Name and prompt save once the typing pauses; one that is not valid is held back and named. */
  function saveText(field: TextField): void {
    if (startsRow()) {
      if (blocker === null) saver.later('create', create);
      return;
    }
    const problem = problemOf(field);
    if (problem !== null) {
      saver.invalid(field, problem);
      return;
    }
    const patch: CustomTaskPatch =
      field === 'label' ? { label: label.trim() } : { system: prompt.system, user: prompt.user };
    saver.later(field, write(patch));
  }

  /** A toggle, a radio or Effort: saved at once, on its own. */
  function saveNow(patch: CustomTaskPatch): void {
    if (startsRow()) {
      // The create writes the whole draft, this change included.
      if (blocker === null) void saver.now(create);
      return;
    }
    void saver.now(write(patch));
  }

  function setLabel(v: string): void {
    label = v;
    saveText('label');
  }
  function setPrompt(next: PromptTemplate): void {
    prompt = next;
    saveText('prompt');
  }

  // The cap counts every item, so a task already in the menu can always leave it.
  const menuFull = $derived(!inMenu && s.contextMenuItems.length >= CONTEXT_MENU_ITEMS_MAX);

  async function setMenu(on: boolean): Promise<void> {
    inMenu = on;
    if (rowId === null) return;
    const id = rowId;
    const ok = await saver.now(async () => {
      const { settings, removed } = await setTaskInMenu(id, on);
      onSaved(settings);
      if (!on && removed.length > 0) {
        saver.note('Removed from the right-click menu', () => {
          inMenu = true;
          void saver.now(async () => onSaved(await restoreMenuItems(removed)));
        });
      }
    });
    if (!ok) inMenu = !on;
  }

  async function remove(): Promise<void> {
    if (rowId === null) return;
    const name = label.trim() || (initial?.label ?? '');
    saver.discard();
    const out = await deleteCustomTask(rowId).catch((e: unknown) => {
      // A delete frees space, so the storage quota is never the reason.
      saver.invalid('row', reasonOf(e) ?? 'Chrome did not take the change');
      return null;
    });
    if (out === null) return;
    // Read before onClose: the props of an unmounted component are gone by the time Undo runs.
    const saved = onSaved;
    const restored = onRestored;
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
                  .then((next) => {
                    saved(next);
                    restored?.(deleted.row.id);
                  })
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
      // A create started by a toggle may still be running; the row it makes is what closing keeps.
      await creating?.catch(() => undefined);
      if (rowId === null && hasText) {
        const discard = await confirmDialog({
          title: 'Discard this task?',
          body: 'You started a task and it is not saved yet.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep editing',
        });
        if (!discard) return;
      } else if (rowId !== null && !gone) {
        const fields = (['label', 'prompt'] as const)
          .filter((f) => problemOf(f) !== null)
          .map((f) => FIELD_NAMES[f]);
        if (!(await confirmCloseWithout(fields))) return;
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
  const idleText = $derived(rowId === null && blocker !== null ? `Not saved yet: ${blocker}` : '');
</script>

<Dialog
  open
  title={initial ? `Edit ${initial.label}` : 'New task'}
  focusTitle
  onClose={() => void close()}
  size="lg"
>
  <!-- A text field also saves when focus leaves it. -->
  <div class="custom-task" data-ega-custom-task-dialog onfocusout={() => void saver.flush()}>
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
          saveNow({ output });
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
            saveNow({ effort: v === '' ? undefined : v });
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
          onchange={(on) => saveNow({ pageContext: on })}
        />
        <Checkbox
          label="Reads images"
          bind:checked={image}
          inputAttrs={{ 'data-ega-custom-task-image': true }}
          onchange={(on) => saveNow({ image: on })}
        />
        <Checkbox
          label="Use glossary"
          bind:checked={glossary}
          inputAttrs={{ 'data-ega-custom-task-glossary': true }}
          onchange={(on) => saveNow({ glossary: on })}
        />
        <Checkbox
          label="Show in right-click menu"
          checked={inMenu}
          ariaDisabled={menuFull}
          {...menuFull ? { describedBy: `${uid}-menu-full` } : {}}
          inputAttrs={{ 'data-ega-custom-task-menu': true }}
          onchange={(on) => void setMenu(on)}
        />
        {#if menuFull}
          <p class="ct-hint ct-indent" id="{uid}-menu-full" data-ega-disabled-reason>
            The right-click menu is full ({CONTEXT_MENU_ITEMS_MAX} items). Remove one on the Selection
            and picker tab.
          </p>
        {/if}
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
  .ct-indent {
    padding-inline-start: calc(16px + var(--space-2));
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
