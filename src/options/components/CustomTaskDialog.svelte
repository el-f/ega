<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
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
  import { customAnswerSpec, answerOutput } from '@/shared/answer/custom';
  import { describeReply } from '@/shared/answer/describe';
  import { validateSpec, type AnswerField } from '@/shared/answer/spec';
  import type { StoredAnswerSpec } from '@/shared/custom-answer-schema';
  import AnswerFieldsEditor from './AnswerFieldsEditor.svelte';
  import { fieldErrors } from '@/options/answer-fields';
  import AnswerPreview from './AnswerPreview.svelte';
  import ReplySection from './ReplySection.svelte';
  import { embedsOwnFormat, convertOwnFormat } from '@/options/own-answer-format';
  import { namesOwnFormat } from '@/shared/backends/structured-output';
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
  let answer = $state<StoredAnswerSpec | undefined>(initial?.answer);
  // Opens on the shape that runs; only a task's own fields get a custom: spec id.
  const saved = customAnswerSpec(initial ?? { output: 'plain' });
  const ownSaved = saved.id.startsWith('custom:');
  let answerMode = $state<'plain' | 'card' | 'fields'>(
    ownSaved ? 'fields' : (initial?.output ?? 'plain'),
  );
  let ownFields = $state<AnswerField[]>(ownSaved ? [...saved.fields] : []);
  let answersIn = $state<'input' | 'target'>(initial?.answersIn ?? 'target');
  let effort = $state<'' | TaskEffort>(initial?.effort ?? '');
  let pageContext = $state(initial?.pageContext ?? false);
  let image = $state(initial?.image ?? false);
  let glossary = $state(initial?.glossary ?? false);
  let inMenu = $state(untrack(() => (initial ? taskInMenu(s, initial.id) : false)));
  let gone = $state(false);

  const saver = createDialogSaver();
  onDestroy(() => saver.dispose());

  let varieties = $state.raw<Variety[]>([]);
  let editor = $state<ReturnType<typeof PromptEditor>>();
  void listVarieties({ enabledOnly: false }).then((vs) => (varieties = vs));

  const draft = $derived<CustomTaskInput>({
    label: label.trim(),
    system: prompt.system,
    user: prompt.user,
    output: answerOutput(answer, output),
    ...(answer !== undefined ? { answer } : {}),
    answersIn,
    pageContext,
    image,
    glossary,
    ...(effort !== '' ? { effort } : {}),
  });
  const taskKey = $derived(rowId ?? 'custom');
  const messageError = $derived(checkPrompt(prompt, 'custom', taskKey).messageError);
  const answerSpec = $derived(customAnswerSpec(draft, taskKey));
  const ownFormat = $derived(embedsOwnFormat(prompt));
  const conversion = $derived(ownFormat ? convertOwnFormat(prompt, ownFormat) : null);
  // Ega's contract always follows the instructions, so a format they name means the model gets two.
  const asksOwnFormat = $derived(ownFormat !== null || namesOwnFormat(prompt));
  // Each field shows its own problem; the footer only points at them, so it stays one short line.
  const FIX_FIELDS = 'fix the reply fields';
  function fieldsProblem(fields: readonly AnswerField[]): string | null {
    const spec = { id: `custom:${taskKey}`, version: 1, fields, join: 'after-build' } as const;
    return fieldErrors(fields).size > 0 || validateSpec(spec).length > 0 ? FIX_FIELDS : null;
  }
  const answerProblem = $derived(answerMode === 'fields' ? fieldsProblem(ownFields) : null);

  type TextField = 'label' | 'prompt';
  /** Why a text field cannot be saved as typed, in the status line's words; null when it can. */
  function problemOf(field: TextField): string | null {
    if (field === 'label') return label.trim() === '' ? 'add a name' : null;
    return messageError !== null ? 'the message needs the Selected text variable' : null;
  }
  /** What a new task still needs before it is created; null once it can be. */
  const blocker = $derived(problemOf('label') ?? problemOf('prompt') ?? answerProblem);
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

  // The Undo of the last Turn into fields; any later change to what it puts back ends it.
  let undoTurn = $state<(() => void) | null>(null);

  function setLabel(v: string): void {
    label = v;
    saveText('label');
  }
  function setPrompt(next: PromptTemplate): void {
    undoTurn = null;
    prompt = next;
    saveText('prompt');
  }

  function setAnswerMode(next: string): void {
    if (next !== 'plain' && next !== 'card' && next !== 'fields') return;
    undoTurn = null;
    if (next === 'fields') {
      if (ownFields.length === 0)
        ownFields = answerSpec.fields.map((f) => ({
          ...f,
          ...(f.role === 'main' ? { key: 'answer' } : {}),
        }));
      answerMode = next;
      setFields(ownFields);
      return;
    }
    answerMode = next;
    output = next;
    answer = { v: 1, preset: next === 'card' ? 'answer-notes' : 'answer-only' };
    saver.valid('answer');
    saveNow({ output, answer });
  }
  function setFields(fields: AnswerField[]): void {
    undoTurn = null;
    ownFields = fields;
    answer = { v: 1, fields };
    output = fields.some((f) => f.role === 'notes') ? 'card' : 'plain';
    if (fieldsProblem(fields) !== null) {
      saver.invalid('answer', '');
      return;
    }
    saver.valid('answer');
    if (startsRow()) {
      if (blocker === null) saver.later('create', create);
      return;
    }
    saver.later('answer', write({ answer, output }));
  }

  async function convertInstructions(): Promise<void> {
    const converted = conversion;
    if (converted === null) return;
    const previous = {
      prompt: { ...prompt },
      answer,
      output,
      mode: answerMode,
      fields: [...ownFields],
    };
    prompt = converted.prompt;
    answerMode = 'fields';
    ownFields = converted.fields;
    answer = { v: 1, fields: converted.fields };
    output = answerOutput(answer, output);
    saver.valid('answer');
    const saving = saver.now(
      startsRow() ? create : write({ system: prompt.system, user: prompt.user, answer, output }),
    );
    // Said where the button was, not in the footer, so the footer keeps one row (R34, R63).
    undoTurn = () => {
      undoTurn = null;
      prompt = previous.prompt;
      answer = previous.answer;
      output = previous.output;
      answerMode = previous.mode;
      ownFields = previous.fields;
      void saver.now(write({ system: prompt.system, user: prompt.user, answer, output }));
      void tick().then(() => editor?.focusInstructions());
    };
    // The button leaves with its notice, so focus goes to Instructions, as for Use Ega's format (K-9).
    await tick();
    editor?.focusInstructions();
    if (!(await saving)) undoTurn = null;
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
        if (answerProblem !== null) fields.push('the reply fields');
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
  // The fields name their own problem; a reason here would wrap the footer at 400px and move Done.
  const idleText = $derived(
    rowId === null && blocker !== null
      ? blocker === FIX_FIELDS
        ? 'Not saved yet'
        : `Not saved yet: ${blocker}`
      : '',
  );
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
          Default is {EFFORT_LABEL[s.advanced.effort]}, the Effort on the Behavior tab
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

    <ReplySection rows={answerMode === 'fields' ? [] : describeReply(answerSpec)}>
      <div class="ct-grid">
        <span class="ct-label" id="{uid}-shape">Shape</span>
        <RadioGroup
          value={answerMode}
          options={[
            { value: 'plain', label: 'Answer only' },
            { value: 'card', label: 'Answer with notes' },
            { value: 'fields', label: 'Your own fields' },
          ]}
          onValueChange={setAnswerMode}
          orientation="horizontal"
          dataAttrs={{ 'data-ega-custom-task-output': true, 'aria-labelledby': `${uid}-shape` }}
        />

        <span class="ct-label" id="{uid}-reply-language">Language</span>
        <RadioGroup
          value={answersIn}
          options={[
            { value: 'target', label: 'Target language' },
            { value: 'input', label: 'Same as the text' },
          ]}
          onValueChange={(v) => {
            answersIn = v === 'input' ? 'input' : 'target';
            saveNow({ answersIn });
          }}
          orientation="horizontal"
          dataAttrs={{ 'aria-labelledby': `${uid}-reply-language` }}
        />
      </div>
      {#if answerMode === 'fields'}
        <AnswerFieldsEditor fields={ownFields} onchange={setFields} />
      {/if}
      {#snippet after()}
        <AnswerPreview spec={answerSpec} {draft} {s} problem={blocker} taskId={rowId} />
      {/snippet}
    </ReplySection>

    {#snippet ownFormatNotice()}
      <p class="ct-format-line">
        Your instructions ask for their own format. Ega adds its own too, so the model gets two and
        may mix them.
      </p>
      {#if ownFormat && conversion === null}
        <p class="ct-format-line">Ega cannot take it out without leaving the instructions empty</p>
      {:else if conversion}
        <div>
          <Button
            variant="secondary"
            size="sm"
            ariaDisabled={problemOf('label') !== null || messageError !== null}
            {...problemOf('label') !== null || messageError !== null
              ? { describedBy: `${uid}-convert-reason` }
              : {}}
            onclick={() => void convertInstructions()}>Turn into fields</Button
          >
        </div>
        {#if problemOf('label') !== null || messageError !== null}<p
            class="ct-hint"
            id="{uid}-convert-reason"
            data-ega-disabled-reason
          >
            Add a task name and a message with Selected text first.
          </p>{/if}
      {/if}
    {/snippet}
    {#snippet turnedNote()}
      <p class="ct-turned" data-ega-turned-note>
        <span role="status">Turned into fields</span>
        <button type="button" class="ct-undo" data-ega-dialog-undo onclick={() => undoTurn?.()}
          >Undo</button
        >
      </p>
    {/snippet}
    <div class="ct-prompt">
      <PromptEditor
        bind:this={editor}
        kind="custom"
        task={taskKey}
        template={prompt}
        builtIn={null}
        snippets={{}}
        sendsPageContext={pageContext}
        onChange={setPrompt}
        buildPreview={preview}
        formatNotice={asksOwnFormat ? ownFormatNotice : undefined}
        formatNote={undoTurn ? turnedNote : undefined}
      />
    </div>
  </div>
  {#snippet actions()}
    <span class="ct-foot-start">
      {#if rowId !== null}
        <Button
          variant="ghost"
          leadingIcon={Trash}
          ariaLabel="Delete task"
          extraClass="ct-del"
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
  /* One label column for the whole dialog: each grid and the Reply section take it as a subgrid. */
  .custom-task {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-5) var(--space-4);
  }
  .custom-task > :global(*) {
    grid-column: 1 / -1;
  }
  .ct-grid {
    display: grid;
    grid-template-columns: subgrid;
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
  .ct-format-line {
    margin: 0;
  }
  .ct-turned {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-height: 32px;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  /* The footer's Undo look (DialogStatus). */
  .ct-undo {
    min-height: 24px;
    padding: 0 var(--space-1);
    border: 0;
    background: transparent;
    color: var(--color-accent-hover);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .ct-undo:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
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
    .custom-task {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* Only the icon, so Delete task, any status and Done stay on one footer row (R63). */
  @container options (max-width: 360px) {
    .ct-foot-start :global(.ct-del .ega-btn-label) {
      display: none;
    }
  }
</style>
