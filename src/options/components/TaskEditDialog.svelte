<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import type { PromptTemplate, Settings, Variety } from '@/shared/types';
  import {
    CURRENT_TEMPLATE_VERSION,
    DEFAULT_PROMPT_TEMPLATE,
    EFFORT_LEVELS,
    isPromptTemplateCustomised,
    type TaskEffort,
  } from '@/shared/settings-schema';
  import { answerFormatFor, buildTaskTemplate } from '@/shared/task-template';
  import { TASK_LABELS, type Task } from '@/shared/task-prompts';
  import { builtInTaskView, hasOwnPrompt } from '@/shared/task-view';
  import { ownTaskPrompt } from '@/shared/task-template';
  import { taskDefaultEffort } from '@/shared/backend-params';
  import { TASK_DESCRIPTIONS } from '@/options/task-descriptions';
  import { EFFORT_LABEL } from '@/options/effort-labels';
  import { replaceTaskEdit, resetTask, restoreTask, updateTask } from '@/shared/tasks';
  import { updateSettings } from '@/shared/storage';
  import { listVarieties } from '@/shared/varieties';
  import { buildPreviewPrompt, PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
  import { toastStore } from '@/shared/components/toastStore';
  import { reportSaveFailure } from '@/options/storage-with-toast';
  import PromptEditor from '@/options/components/prompt/PromptEditor.svelte';
  import { checkPrompt } from '@/options/components/prompt/prompt-checks';
  import TemplateVersionBanner from '@/options/components/TemplateVersionBanner.svelte';
  import TemplateDiffModal from '@/options/components/TemplateDiffModal.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import DialogStatus from '@/options/components/DialogStatus.svelte';
  import { confirmCloseWithout, createDialogSaver } from '@/options/components/dialog-saver.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Segmented from '@/shared/ui/Segmented.svelte';
  import { id as makeId } from '@/shared/uuid';

  interface Props {
    s: Settings;
    task: Task;
    onClose: () => void;
    onSaved: (next: Settings) => void;
    /** Explain has no prompt of its own; this opens the Translate dialog in its place. */
    onSwitchTask?: (task: Task) => void;
  }

  const { s, task, onClose, onSaved, onSwitchTask }: Props = $props();

  const uid = makeId('ega-task-dialog');
  const view = $derived(builtInTaskView(s, task));
  const label = $derived(TASK_LABELS[task]);
  const isTranslate = $derived(task === 'translate');
  const ownPrompt = $derived(hasOwnPrompt(task));
  const helpLine = $derived(
    task === 'translate'
      ? 'Explain and every language without its own prompt use this prompt too'
      : TASK_DESCRIPTIONS[task].replace(/\.$/, ''),
  );

  const saver = createDialogSaver();
  onDestroy(() => saver.dispose());

  // Explain has no prompt of its own (it runs the Translate one), so it gets no editor and these stay unused.
  function storedPrompt(cur: Settings): PromptTemplate {
    return hasOwnPrompt(task) ? ownTaskPrompt(cur, task) : cur.advanced.promptTemplate;
  }
  const builtIn = $derived(hasOwnPrompt(task) ? buildTaskTemplate(task) : DEFAULT_PROMPT_TEMPLATE);
  // The dialog owns the draft; a write that lands later never overwrites what is being typed.
  let draft = $state<PromptTemplate>(untrack(() => storedPrompt(s)));
  const promptKind = $derived(task === 'translate' ? ('translate' as const) : ('task' as const));
  const invalid = $derived(
    ownPrompt || isTranslate ? checkPrompt(draft, promptKind, task).messageError !== null : false,
  );

  // A reset with no Undo yet: closing repeats its Undo in a toast.
  let lastReset: Awaited<ReturnType<typeof resetTask>>['removed'] | null = null;
  const promptEdited = $derived(
    task === 'translate' && isPromptTemplateCustomised(s.advanced.promptTemplate),
  );
  const canReset = $derived(view.hasOverrides || promptEdited);

  let varieties = $state.raw<Variety[]>([]);
  void listVarieties({ enabledOnly: false }).then((vs) => (varieties = vs));

  function preview(tpl: PromptTemplate, explain: boolean): { system: string; user: string } {
    return buildPreviewPrompt(s, {
      task,
      explain,
      template: tpl,
      text: PREVIEW_SAMPLE_TEXT,
      sourceLang: 'auto',
      targetLang: s.defaultTargetLang ?? 'en',
      varieties,
    });
  }

  function writePrompt(tpl: PromptTemplate): () => Promise<void> {
    return async () => {
      const next =
        task === 'translate'
          ? await updateSettings({ advanced: { promptTemplate: tpl } as Settings['advanced'] })
          : await updateTask(task, tpl);
      onSaved(next);
    };
  }

  function onPromptChange(next: PromptTemplate): void {
    draft = next;
    lastReset = null;
    if (checkPrompt(next, promptKind, task).messageError !== null) {
      saver.invalid('prompt', 'the message needs the Selected text variable');
      return;
    }
    saver.later('prompt', writePrompt(next));
  }

  function write(fn: () => Promise<Settings>): void {
    lastReset = null;
    void saver.now(async () => onSaved(await fn()));
  }

  const effortValue = $derived(s.taskOverrides[task]?.effort ?? '');
  function setEffort(v: '' | TaskEffort): void {
    if (v === '') {
      write(() =>
        replaceTaskEdit(task, (cur) => {
          const { effort: _e, ...rest } = cur ?? {};
          void _e;
          return rest;
        }),
      );
    } else {
      write(() => updateTask(task, { effort: v }));
    }
  }

  async function reset(): Promise<void> {
    saver.discard();
    const out = await resetTask(task).catch(() => null);
    if (out === null) {
      saver.invalid('reset', 'the task could not be reset');
      return;
    }
    onSaved(out.settings);
    draft = storedPrompt(out.settings);
    const removed = out.removed;
    lastReset = removed;
    saver.note('Back to built-in', () => void undoReset(removed));
    // The pill hides once nothing differs, so focus moves to the Undo that took its place.
    await focusInFooter('[data-ega-dialog-undo]');
  }

  async function focusInFooter(selector: string): Promise<void> {
    await tick();
    const footer = document.getElementById(`${uid}-foot`)?.parentElement;
    (
      footer?.querySelector<HTMLElement>(selector) ??
      footer?.querySelector<HTMLElement>('[data-ega-dialog-done]')
    )?.focus();
  }

  async function undoReset(
    removed: Awaited<ReturnType<typeof resetTask>>['removed'],
  ): Promise<void> {
    const next = await restoreTask(task, removed).catch(() => null);
    if (next === null) {
      saver.invalid('reset', 'your edits could not be put back');
      return;
    }
    lastReset = null;
    onSaved(next);
    draft = storedPrompt(next);
    saver.note('Your edits are back');
    await focusInFooter('[data-ega-section-reset]');
  }

  async function useNewPrompt(): Promise<void> {
    const prior = {
      promptTemplate: s.advanced.promptTemplate,
      templateVersion: s.advanced.templateVersion,
      templateVersionAcknowledged: s.advanced.templateVersionAcknowledged,
    };
    await saver.now(async () => {
      onSaved(
        await updateSettings({
          advanced: {
            promptTemplate: { ...DEFAULT_PROMPT_TEMPLATE },
            templateVersion: CURRENT_TEMPLATE_VERSION,
            templateVersionAcknowledged: CURRENT_TEMPLATE_VERSION,
          } as Settings['advanced'],
        }),
      );
    });
    draft = { ...DEFAULT_PROMPT_TEMPLATE };
    saver.note('Updated to the new prompt', () => {
      void saver
        .now(async () => onSaved(await updateSettings({ advanced: prior as Settings['advanced'] })))
        .then((ok) => {
          if (!ok) return;
          draft = prior.promptTemplate;
          saver.note('Your prompt is back');
        });
    });
  }

  function keepMine(): void {
    write(() =>
      updateSettings({
        advanced: { templateVersionAcknowledged: CURRENT_TEMPLATE_VERSION } as Settings['advanced'],
      }),
    );
  }

  let diffOpen = $state(false);
  let closing = false;

  // Done, Esc, the x and a click outside all save what is waiting, then close.
  async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    try {
      await saver.flush();
      if (!(await confirmCloseWithout(invalid ? ['the message'] : []))) return;
      // Read before onClose: the props of an unmounted component are gone by the time Undo runs.
      const removed = lastReset;
      const name = label;
      const id = task;
      const saved = onSaved;
      onClose();
      if (removed === null || (removed.edit === undefined && removed.prompt === undefined)) return;
      toastStore.push({
        message: `${name} is back to built-in`,
        variant: 'success',
        action: {
          label: 'Undo',
          onClick: () =>
            void restoreTask(id, removed)
              .then(saved)
              .catch((e: unknown) => reportSaveFailure(e)),
        },
      });
    } finally {
      closing = false;
    }
  }

  const effortOptions = [
    { value: '' as const, label: 'Default' },
    ...EFFORT_LEVELS.map((e) => ({ value: e, label: EFFORT_LABEL[e] })),
  ];
</script>

<Dialog open title={`${label} task`} focusTitle onClose={() => void close()} size="lg">
  {#snippet help()}{helpLine}{/snippet}
  <!-- A text field also saves when focus leaves it. -->
  <div class="task-edit" data-ega-task-dialog={task} onfocusout={() => void saver.flush()}>
    <div class="te-grid">
      <span class="te-label" id="{uid}-effort">Effort</span>
      <div class="te-control" data-ega-task-effort>
        <Segmented
          value={effortValue}
          options={effortOptions}
          ariaLabelledby="{uid}-effort"
          describedBy="{uid}-effort-hint"
          itemAttr="data-ega-effort-value"
          onchange={setEffort}
        />
        <p class="te-hint" id="{uid}-effort-hint" data-ega-hint>
          Default for this task is {EFFORT_LABEL[taskDefaultEffort(s, task)]}
        </p>
      </div>

      <span class="te-label" id="{uid}-inputs">Inputs</span>
      <div class="te-control" role="group" aria-labelledby="{uid}-inputs">
        <Checkbox
          label="Send page context"
          checked={view.pageContext}
          ariaDisabled={!s.contextEnabled}
          {...s.contextEnabled ? {} : { describedBy: `${uid}-ctx-off` }}
          inputAttrs={{ 'data-ega-task-page-context': true }}
          onchange={(on) => write(() => updateTask(task, { pageContext: on }))}
        />
        {#if !s.contextEnabled}
          <p class="te-hint te-indent" id="{uid}-ctx-off" data-ega-disabled-reason>
            Page context is off on the Answers tab
          </p>
        {/if}
        <Checkbox
          label="Use glossary"
          checked={view.glossary}
          inputAttrs={{ 'data-ega-task-glossary': true }}
          onchange={(on) => write(() => updateTask(task, { glossary: on }))}
        />
      </div>

      <span class="te-label">Answers</span>
      <p class="te-facts" data-ega-task-facts>
        {view.output === 'card' ? 'Answer with notes' : 'Answer only'} ·
        {view.image ? 'Reads images' : 'Text only'}
      </p>
    </div>

    <div class="te-prompt">
      {#if isTranslate || ownPrompt}
        <PromptEditor
          kind={promptKind}
          {task}
          template={draft}
          {builtIn}
          format={answerFormatFor(task)}
          snippets={s.advanced.snippets}
          sendsPageContext={view.pageContext && s.contextEnabled}
          onChange={onPromptChange}
          buildPreview={preview}
        >
          {#snippet notice()}
            {#if isTranslate}
              <TemplateVersionBanner
                userVersion={s.advanced.templateVersion}
                currentVersion={CURRENT_TEMPLATE_VERSION}
                acknowledgedVersion={s.advanced.templateVersionAcknowledged}
                onKeepMine={keepMine}
                onShowDiff={() => (diffOpen = true)}
                onUseNew={() => void useNewPrompt()}
              />
            {/if}
          {/snippet}
        </PromptEditor>
      {:else}
        <p class="te-line" data-ega-task-prompt-note>
          Explain uses the Translate prompt and adds its own instructions
        </p>
        {#if onSwitchTask}
          <div>
            <Button variant="secondary" onclick={() => onSwitchTask('translate')}>
              Edit the Translate prompt
            </Button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
  {#snippet actions()}
    <span class="te-foot-start" id="{uid}-foot">
      <SectionReset
        modified={canReset}
        label="Reset task"
        ariaLabel="Reset task to built-in"
        onReset={reset}
      />
      <DialogStatus status={saver.status} />
    </span>
    <Button onclick={() => void close()} dataAttrs={{ 'data-ega-dialog-done': true }}>Done</Button>
  {/snippet}
</Dialog>

{#if diffOpen}
  <TemplateDiffModal
    userTemplate={s.advanced.promptTemplate}
    currentTemplate={DEFAULT_PROMPT_TEMPLATE}
    onClose={() => (diffOpen = false)}
  />
{/if}

<style>
  .task-edit {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .te-grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3) var(--space-4);
  }
  .te-label {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .te-control {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  .te-hint,
  .te-line {
    margin: 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .te-indent {
    padding-inline-start: calc(16px + var(--space-2));
  }
  .te-facts {
    margin: 0;
    min-height: 32px;
    display: flex;
    align-items: center;
    font-size: var(--fs-base);
  }
  .te-prompt {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
  }
  .te-foot-start {
    margin-inline-end: auto;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  @container options (max-width: 600px) {
    .te-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
