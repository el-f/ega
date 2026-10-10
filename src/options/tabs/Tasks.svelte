<script lang="ts">
  import { isPromptTemplateCustomised } from '@/shared/prompt-defaults';
  import { tick } from 'svelte';
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import {
    ALL_TASKS,
    ALL_TONES,
    TASK_LABELS,
    TONE_LABELS,
    runnableDefaultTask,
    type Task,
    type Tone,
  } from '@/shared/task-prompts';
  import { builtInTaskView, materializeTasks } from '@/shared/task-view';
  import { setTaskEnabled } from '@/shared/tasks';
  import type { CustomTask } from '@/shared/settings-schema';
  import { CUSTOM_TASKS_MAX } from '@/shared/storage/sanitise';
  import CustomTaskDialog from '@/options/components/CustomTaskDialog.svelte';
  import BackupRestoreRow from '@/options/components/BackupRestoreRow.svelte';
  import { getSettings as readSettings } from '@/shared/storage';
  import { liveCustomTasks } from '@/options/custom-tasks-state.svelte';
  import { exportTasks } from '@/shared/storage/backup';
  import { importBundleFile, type ImportStatus } from '@/options/import-bundle';
  import { count } from '@/shared/utils/count';
  import { downloadJsonFile } from '@/shared/download-file';
  import { saveSettings, saveVia, showSettingsWrite } from '@/options/storage-with-toast';
  import TabHeader from '@/shared/components/TabHeader.svelte';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import ListPlus from '@lucide/svelte/icons/list-plus';
  import TaskEditDialog from '@/options/components/TaskEditDialog.svelte';

  interface Props {
    s: Settings | null;
    onSetSettings: (next: Settings) => void;
  }

  const { s, onSetSettings }: Props = $props();

  let editing = $state<Task | null>(null);
  /** A custom row being edited, or 'new' for the add form. */
  let editingCustom = $state<CustomTask | 'new' | null>(null);
  const custom = liveCustomTasks();
  const customTasks = $derived(custom.rows);
  const loadCustomTasks = custom.reload;

  const views = $derived(s ? materializeTasks(s, customTasks) : []);
  const atCap = $derived(customTasks.length >= CUSTOM_TASKS_MAX);

  let backupState = $state<ImportStatus | null>(null);

  async function doExport(): Promise<void> {
    backupState = null;
    try {
      const bundle = await exportTasks();
      downloadJsonFile(`ega-tasks-${new Date().toISOString().slice(0, 10)}.json`, bundle);
      backupState = {
        kind: 'ok',
        msg: `Exported ${count(bundle.egaTasks.customTasks.length, 'task')} and ${count(Object.keys(bundle.egaTasks.taskOverrides).length, 'edit')}`,
      };
    } catch (e) {
      backupState = { kind: 'err', msg: `Export failed: ${(e as Error).message}` };
    }
  }

  async function doImport(file: File): Promise<void> {
    backupState = null;
    const status = await importBundleFile(file, 'tasks');
    if (!status) return;
    backupState = status;
    if (status.kind === 'ok') {
      void loadCustomTasks();
      onSetSettings(await readSettings());
    }
  }
  const customViews = $derived(views.filter((v) => v.kind === 'custom'));

  const toneOptions = ALL_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }));

  async function patch(p: Partial<Settings>): Promise<void> {
    await showSettingsWrite(await saveSettings(p), onSetSettings);
  }

  async function toggle(t: string, on: boolean): Promise<void> {
    await showSettingsWrite(await saveVia(() => setTaskEnabled(t, on)), onSetSettings);
  }

  // Focus never drops to the page when the dialog closes: back to its opener, else to the row that took a
  // deleted task's place (or the one above), else to New task.
  let opener: HTMLElement | null = null;
  let openerIndex = -1;
  function openCustom(row: CustomTask | 'new', from: EventTarget | null): void {
    opener = from instanceof HTMLElement ? from : null;
    openerIndex = row === 'new' ? -1 : customViews.findIndex((v) => v.id === row.id);
    editingCustom = row;
  }
  const newTaskButton = (): HTMLElement | null =>
    document.querySelector<HTMLElement>(
      '[data-ega-custom-task-new], [data-ega-tab="tasks"] [data-ega-empty-state] button',
    );
  async function closeCustom(): Promise<void> {
    editingCustom = null;
    await loadCustomTasks();
    await tick();
    if (opener?.isConnected === true) {
      opener.focus();
      return;
    }
    const edits = document.querySelectorAll<HTMLElement>(
      '[data-ega-custom-task-list] [data-ega-task-edit]',
    );
    const row = openerIndex < 0 ? null : (edits[Math.min(openerIndex, edits.length - 1)] ?? null);
    (row ?? newTaskButton())?.focus();
  }
  /** After Undo put a deleted task back, its row's Edit takes focus. */
  async function focusTask(id: string): Promise<void> {
    await loadCustomTasks();
    await tick();
    document.querySelector<HTMLElement>(`[data-ega-task-edit="${id}"]`)?.focus();
  }
</script>

<section data-ega-tab="tasks">
  <TabHeader tab="tasks" />
  {#if s}
    {@const settings = s}
    <!-- Controls read members of objects rebuilt with the settings: after a write that did not land, the page hands
         the same stored value back, and only a new object makes a control drop the user's change (spec 3.0). -->
    {@const defaultTask = { value: runnableDefaultTask(settings) }}
    <SectionCard title="Defaults" description="What runs when you do not pick a task">
      <div class="tasks-defaults">
        <div data-ega-setting="defaults.defaultTask">
          <Select
            label="Default task"
            size="sm"
            value={defaultTask.value}
            options={views.filter((v) => !v.disabled).map((v) => ({ value: v.id, label: v.label }))}
            modified={isFieldModified('defaults.defaultTask', settings)}
            onchange={(v) => void patch({ defaultTask: v })}
          />
        </div>
        <div data-ega-setting="defaults.defaultTone">
          <Select
            label="Default tone"
            size="sm"
            value={settings.defaultTone}
            options={toneOptions}
            modified={isFieldModified('defaults.defaultTone', settings)}
            onchange={(v) => void patch({ defaultTone: v as Tone })}
          />
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Built-in tasks"
      description="An off task is hidden in every picker and menu"
      info={{
        label: 'About built-in tasks',
        text: 'Edit a task to change its prompt, effort and inputs. Reset in its dialog puts back the built-in version.',
      }}
    >
      <div data-ega-setting="tasks.overrides">
        <ul class="task-list" data-ega-setting="tasks.enabled">
          {#each ALL_TASKS as t (t)}
            {@const view = builtInTaskView(settings, t)}
            {@const on = { checked: !view.disabled }}
            {@const edited =
              view.hasOverrides ||
              (t === 'translate' && isPromptTemplateCustomised(settings.advanced.promptTemplate))}
            <li class="task-row" data-ega-task-item={t}>
              <Checkbox
                id={`ega-task-toggle-${t}`}
                label={TASK_LABELS[t]}
                checked={on.checked}
                ariaDisabled={t === 'translate'}
                {...t === 'translate' ? { describedBy: 'ega-task-always-on' } : {}}
                inputAttrs={{ 'data-ega-task-toggle': t }}
                onchange={(on) => void toggle(t, on)}
              />
              {#if t === 'translate'}
                <span id="ega-task-always-on"><Badge variant="muted">Always on</Badge></span>
              {/if}
              {#if edited}<Badge variant="muted">Edited</Badge>{/if}
              <span class="task-spacer"></span>
              <Button
                variant="ghost"
                size="sm"
                ariaLabel={`Edit ${TASK_LABELS[t]}`}
                dataAttrs={{ 'data-ega-task-edit': t }}
                onclick={() => (editing = t)}>Edit</Button
              >
            </li>
          {/each}
        </ul>
      </div>
    </SectionCard>

    <SectionCard
      title="Your tasks"
      description="Tasks you write yourself, each with its own prompt"
    >
      {#snippet headerActions()}
        {#if customViews.length > 0}
          <Button
            variant="secondary"
            size="sm"
            iconKind="add"
            ariaDisabled={atCap}
            {...atCap ? { describedBy: 'ega-custom-task-cap' } : {}}
            dataAttrs={{ 'data-ega-custom-task-new': true }}
            onclick={(e) => openCustom('new', e.currentTarget)}>New task</Button
          >
        {/if}
      {/snippet}
      {#if atCap}
        <p class="tasks-cap" id="ega-custom-task-cap" data-ega-custom-task-cap>
          You have the most tasks Ega keeps ({CUSTOM_TASKS_MAX}). Delete one to add another.
        </p>
      {/if}
      {#if customViews.length === 0}
        <EmptyState
          title="No tasks of your own yet"
          description="Write a prompt once and run it on any text"
          icon={ListPlus}
          ctaLabel="New task"
          onCta={() => openCustom('new', document.activeElement)}
        />
      {:else}
        <ul class="task-list" data-ega-custom-task-list>
          {#each customViews as v (v.id)}
            {@const on = { checked: !v.disabled }}
            <li class="task-row" data-ega-task-item={v.id}>
              <Checkbox
                id={`ega-task-toggle-${v.id}`}
                label={v.label}
                checked={on.checked}
                inputAttrs={{ 'data-ega-task-toggle': v.id }}
                onchange={(on) => void toggle(v.id, on)}
              />
              <span class="task-spacer"></span>
              <Button
                variant="ghost"
                size="sm"
                ariaLabel={`Edit ${v.label}`}
                dataAttrs={{ 'data-ega-task-edit': v.id }}
                onclick={(e) => {
                  const found = customTasks.find((c) => c.id === v.id);
                  if (found) openCustom(found, e.currentTarget);
                }}>Edit</Button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </SectionCard>

    <SectionCard
      title="Backup and restore"
      description="Your tasks, their edits and on/off state"
      info={{
        label: 'About this backup',
        text: 'The file also holds the Translate prompt. Import restores your tasks or adds tasks someone shared.',
      }}
    >
      <BackupRestoreRow
        onExport={doExport}
        onImport={doImport}
        status={backupState}
        scope="tasks"
      />
    </SectionCard>

    {#if editingCustom}
      <CustomTaskDialog
        s={settings}
        row={editingCustom === 'new' ? undefined : editingCustom}
        onClose={() => void closeCustom()}
        onSaved={(next) => {
          if (next) onSetSettings(next);
          void loadCustomTasks();
        }}
        onRestored={(id) => void focusTask(id)}
      />
    {/if}

    {#if editing}
      <!-- Keyed: Explain's 'Edit the Translate prompt' swaps the task, and the dialog's draft belongs to one task. -->
      {#key editing}
        <TaskEditDialog
          s={settings}
          task={editing}
          onClose={() => (editing = null)}
          onSaved={onSetSettings}
          onSwitchTask={(t) => (editing = t)}
        />
      {/key}
    {/if}
  {:else}
    <LoadingState rows={4} label="Loading tasks…" />
  {/if}
</section>

<style>
  .tasks-defaults {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: var(--space-3);
  }
  .tasks-cap {
    margin: 0 0 var(--space-2);
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* Rows sit in the card, so a hairline sets them apart, not a box (R25). */
  .task-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    padding-block: var(--space-1);
  }
  .task-row + .task-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .task-row > :global(.ega-checkbox) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .task-spacer {
    flex: 1 1 auto;
  }
</style>
