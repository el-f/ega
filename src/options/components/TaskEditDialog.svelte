<script lang="ts">
  import type { Settings } from '@/shared/types';
  import {
    CURRENT_TEMPLATE_VERSION,
    EFFORT_LEVELS,
    isPromptTemplateCustomised,
    type TaskEffort,
  } from '@/shared/settings-schema';
  import { buildTaskTemplate, TASK_LABELS, type Task } from '@/shared/task-prompts';
  import { builtInTaskView, hasOwnPrompt, ownTaskPrompt } from '@/shared/task-view';
  import { taskDefaultEffort } from '@/shared/backend-params';
  import { EFFORT_LABEL } from '@/options/components/EffortSegmented.svelte';
  import { replaceTaskEdit, resetTask, restoreTask, updateTask } from '@/shared/tasks';
  import { DEFAULT_TEMPLATE } from '@/shared/prompts';
  import { saveVia } from '@/options/storage-with-toast';
  import { createTemplatesHandlers } from '@/options/templates-handlers';
  import { toastStore } from '@/shared/components/toastStore';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import TemplateEditor from '@/options/components/TemplateEditor.svelte';
  import TemplateVersionBanner from '@/options/components/TemplateVersionBanner.svelte';
  import TemplateDiffModal from '@/options/components/TemplateDiffModal.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Select from '@/shared/ui/Select.svelte';

  interface Props {
    s: Settings;
    task: Task;
    onClose: () => void;
    onSaved: (next: Settings) => void;
  }

  const { s, task, onClose, onSaved }: Props = $props();

  const view = $derived(builtInTaskView(s, task));
  const label = $derived(TASK_LABELS[task]);

  const effortOptions = $derived([
    {
      value: '',
      label: `Default (${EFFORT_LABEL[taskDefaultEffort(s, task)]})`,
    },
    ...EFFORT_LEVELS.map((e) => ({ value: e, label: EFFORT_LABEL[e] })),
  ]);

  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next) => onSaved(next),
  });
  // Translate's prompt is the global one, so its Reset also covers that prompt.
  const promptEdited = $derived(
    task === 'translate' && isPromptTemplateCustomised(s.advanced.promptTemplate),
  );
  let diffOpen = $state(false);
  let promptDirty = $state(false);

  // Done, Escape, the x and a click outside all close the dialog, and the prompt draft lives only in the editor.
  async function close(): Promise<void> {
    if (promptDirty) {
      const discard = await confirmDialog({
        title: 'Discard your prompt changes?',
        body: 'You changed the prompt and did not save it. Close anyway?',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
  }

  async function overwritePrompt(): Promise<void> {
    const ok = await confirmDialog({
      title: 'Overwrite prompt template?',
      body: 'This replaces your prompt template with the new default. This cannot be undone.',
      confirmLabel: 'Overwrite',
      danger: true,
    });
    if (!ok) return;
    await handlers.patchAdvanced({
      promptTemplate: { ...DEFAULT_TEMPLATE },
      templateVersion: CURRENT_TEMPLATE_VERSION,
      templateVersionAcknowledged: CURRENT_TEMPLATE_VERSION,
    });
  }

  async function save(write: () => Promise<Settings>): Promise<void> {
    const next = await saveVia(write);
    if (next) onSaved(next);
  }

  function setEffort(v: string): void {
    if (v === '') {
      void save(() =>
        replaceTaskEdit(task, (cur) => {
          const { effort: _e, ...rest } = cur ?? {};
          void _e;
          return rest;
        }),
      );
    } else {
      void save(() => updateTask(task, { effort: v as TaskEffort }));
    }
  }

  // The dialog closes first: it traps focus and closes on an outside click, so its own toast would be out of reach.
  async function reset(): Promise<void> {
    const id = task;
    const name = label;
    if (promptEdited) {
      const ok = await confirmDialog({
        title: `Reset ${name}?`,
        body: 'This also resets the Translate prompt. Explain and every language without its own prompt use it too.',
        confirmLabel: 'Reset',
        danger: true,
      });
      if (!ok) return;
    }
    const out = await saveVia(() => resetTask(id));
    if (!out) return;
    onSaved(out.settings);
    onClose();
    const removed = out.removed;
    if (removed.edit === undefined && removed.prompt === undefined) return;
    toastStore.push({
      message: `${name} is back to the built-in settings.`,
      variant: 'success',
      action: { label: 'Undo', onClick: () => void save(() => restoreTask(id, removed)) },
    });
  }
</script>

<Dialog open title={`${label} task`} onClose={() => void close()} size="lg">
  <div class="task-edit" data-ega-task-dialog={task}>
    {#if task === 'translate'}
      <TemplateVersionBanner
        userVersion={s.advanced.templateVersion}
        currentVersion={CURRENT_TEMPLATE_VERSION}
        acknowledgedVersion={s.advanced.templateVersionAcknowledged}
        onKeepMine={() =>
          void handlers.patchAdvanced({ templateVersionAcknowledged: CURRENT_TEMPLATE_VERSION })}
        onShowDiff={() => (diffOpen = true)}
        onOverwrite={() => void overwritePrompt()}
      />
      <TemplateEditor
        scope={{ scope: 'global' }}
        task="translate"
        template={s.advanced.promptTemplate}
        inheritedTemplate={DEFAULT_TEMPLATE}
        settings={s}
        onSave={handlers.saveGlobalTemplate}
        onReset={handlers.resetGlobalTemplate}
        inheritedLabel="Use built-in"
        onDirtyChange={(d) => (promptDirty = d)}
      />
      <p class="task-edit-note">
        Explain and every language without its own prompt use this prompt too.
      </p>
    {:else if hasOwnPrompt(task)}
      <TemplateEditor
        scope={{ scope: 'task', task }}
        {task}
        template={ownTaskPrompt(s, task)}
        inheritedTemplate={buildTaskTemplate(task)}
        settings={s}
        onSave={(tpl) => handlers.setTaskTemplate(task, tpl)}
        onReset={() => handlers.setTaskTemplate(task, null)}
        inheritedLabel="Use built-in"
        onDirtyChange={(d) => (promptDirty = d)}
      />
    {:else}
      <p class="task-edit-line" data-ega-task-prompt-note>
        Uses the Translate prompt, or a language's own prompt when it has one, and adds its explain
        instructions.
      </p>
    {/if}
    <p class="task-edit-line">
      Answer: {view.output === 'card' ? 'Answer with notes' : 'Answer only'} (fixed for this task)
    </p>
    <div data-ega-task-effort>
      <Select
        label="Effort"
        size="sm"
        value={s.taskOverrides[task]?.effort ?? ''}
        options={effortOptions}
        onchange={(v) => setEffort(v)}
      />
    </div>
    <fieldset class="task-edit-inputs">
      <legend>Inputs</legend>
      <Checkbox
        label="Send page context"
        checked={view.pageContext}
        inputAttrs={{ 'data-ega-task-page-context': true }}
        onchange={(on) => void save(() => updateTask(task, { pageContext: on }))}
      />
      {#if !s.contextEnabled}
        <p class="task-edit-note">Page context is off for every task on the Translate tab.</p>
      {/if}
      <Checkbox
        label="Use glossary"
        checked={view.glossary}
        inputAttrs={{ 'data-ega-task-glossary': true }}
        onchange={(on) => void save(() => updateTask(task, { glossary: on }))}
      />
    </fieldset>
    <p class="task-edit-line">
      Images: {view.image ? 'this task takes images' : 'this task does not take images'}
    </p>
  </div>
  {#snippet actions()}
    <Button
      variant="secondary"
      disabled={!view.hasOverrides && !promptEdited}
      dataAttrs={{ 'data-ega-task-reset': true }}
      onclick={() => void reset()}>Reset to built-in</Button
    >
    <Button onclick={() => void close()}>Done</Button>
  {/snippet}
</Dialog>

{#if diffOpen}
  <TemplateDiffModal
    userTemplate={s.advanced.promptTemplate}
    currentTemplate={DEFAULT_TEMPLATE}
    onClose={() => (diffOpen = false)}
  />
{/if}

<style>
  .task-edit {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .task-edit-line {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .task-edit-note {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .task-edit-inputs {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .task-edit-inputs legend {
    padding: 0;
    margin-bottom: var(--space-1);
    font-size: var(--fs-sm);
    font-weight: 500;
  }
</style>
