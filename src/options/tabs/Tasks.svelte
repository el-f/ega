<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isPromptTemplateCustomised } from '@/shared/settings-schema';
  import { isFieldModified } from '@/shared/settings-registry';
  import {
    ALL_TASKS,
    ALL_TONES,
    TASK_DESCRIPTIONS,
    TASK_LABELS,
    TONE_LABELS,
    runnableDefaultTask,
    type Task,
    type Tone,
  } from '@/shared/task-prompts';
  import { onDestroy, onMount } from 'svelte';
  import { builtInTaskView, materializeTasks } from '@/shared/task-view';
  import { setTaskEnabled } from '@/shared/tasks';
  import { STORAGE_KEYS } from '@/shared/constants';
  import type { CustomTask } from '@/shared/settings-schema';
  import { debugCatch } from '@/shared/logger';
  import CustomTaskDialog from '@/options/components/CustomTaskDialog.svelte';
  import BackupRestoreRow from '@/options/components/BackupRestoreRow.svelte';
  import { getCustomTasks, getSettings as readSettings } from '@/shared/storage';
  import { exportTasks } from '@/shared/storage/backup';
  import { count, importBundleFile, type ImportStatus } from '@/options/import-bundle';
  import { downloadJsonFile } from '@/shared/download-file';
  import { saveSettings, saveVia } from '@/options/storage-with-toast';
  import TabHeader from '@/shared/components/TabHeader.svelte';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import TaskEditDialog from '@/options/components/TaskEditDialog.svelte';
  import RulesEditor from '@/options/components/RulesEditor.svelte';
  import { createTemplatesHandlers } from '@/options/templates-handlers';
  import { estimateRulesBlockBytes, RULES_BLOCK_WARN_BYTES } from '@/shared/rules-budget';

  interface Props {
    s: Settings | null;
    onSetSettings: (next: Settings) => void;
  }

  const { s, onSetSettings }: Props = $props();

  let editing = $state<Task | null>(null);
  /** A custom row being edited, or 'new' for the add form. */
  let editingCustom = $state<CustomTask | 'new' | null>(null);
  let customTasks = $state.raw<CustomTask[]>([]);

  function loadCustomTasks(): void {
    void getCustomTasks()
      .then((rows) => {
        customTasks = rows;
      })
      .catch((e: unknown) => debugCatch(e, 'options.Tasks.loadCustomTasks'));
  }
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === 'local' && STORAGE_KEYS.customTasks in changes) loadCustomTasks();
  };
  onMount(() => {
    loadCustomTasks();
    chrome.storage.onChanged.addListener(onStorage);
  });
  onDestroy(() => chrome.storage.onChanged.removeListener(onStorage));

  const views = $derived(s ? materializeTasks(s, customTasks) : []);

  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next) => onSetSettings(next),
  });

  // Site- and task-scoped rules only render for their own host/task, so the warning tracks the biggest single request.
  const rulesOverBudget = $derived.by(() => {
    if (!s) return false;
    const rules = s.advanced.rules;
    const hosts = [undefined, ...new Set(rules.flatMap((r) => r.scope.sites ?? []))];
    return views.some(({ id }) =>
      hosts.some((host) => estimateRulesBlockBytes(rules, id, host) > RULES_BLOCK_WARN_BYTES),
    );
  });

  let backupState = $state<ImportStatus | null>(null);

  async function doExport(): Promise<void> {
    backupState = null;
    try {
      const bundle = await exportTasks();
      downloadJsonFile(`ega-tasks-${new Date().toISOString().slice(0, 10)}.json`, bundle);
      backupState = {
        kind: 'ok',
        msg: `Exported ${count(bundle.egaTasks.customTasks.length, 'task')} and ${count(Object.keys(bundle.egaTasks.taskOverrides).length, 'edit')}.`,
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
      loadCustomTasks();
      onSetSettings(await readSettings());
    }
  }
  const customViews = $derived(views.filter((v) => v.kind === 'custom'));

  const toneOptions = ALL_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }));

  async function patch(p: Partial<Settings>): Promise<void> {
    const next = await saveSettings(p);
    if (next) onSetSettings(next);
  }

  async function toggle(t: string, on: boolean): Promise<void> {
    const next = await saveVia(() => setTaskEnabled(t, on));
    if (next) onSetSettings(next);
  }
</script>

<section data-ega-tab="tasks">
  <TabHeader tab="tasks" />
  {#if s}
    {@const settings = s}
    <SectionCard
      title="Backup & restore"
      description="Export tasks, edits (Translate prompt too) and on/off state. Import to restore or share."
    >
      <BackupRestoreRow
        onExport={doExport}
        onImport={doImport}
        status={backupState}
        scope="tasks"
      />
    </SectionCard>

    <SectionCard title="Defaults">
      <div data-ega-setting="defaults.defaultTask">
        <Select
          label="Default task"
          size="sm"
          value={runnableDefaultTask(settings)}
          options={views.filter((v) => !v.disabled).map((v) => ({ value: v.id, label: v.label }))}
          modified={isFieldModified('defaults.defaultTask', settings)}
          onchange={(v) => void patch({ defaultTask: v })}
        />
        <p class="tasks-help">
          {(TASK_DESCRIPTIONS as Record<string, string | undefined>)[
            runnableDefaultTask(settings)
          ] ?? 'Your own task.'}
        </p>
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
        <p class="tasks-help">Used by tasks whose prompt has {'{{tone}}'}, like Reword.</p>
      </div>
    </SectionCard>

    <SectionCard
      title="Built-in tasks"
      description="An off task is hidden in the side panel, tooltip, Re-run, palette and right-click menu."
    >
      <div data-ega-setting="tasks.overrides">
        <ul class="task-list" data-ega-setting="tasks.enabled">
          {#each ALL_TASKS as t (t)}
            {@const view = builtInTaskView(settings, t)}
            {@const edited =
              view.hasOverrides ||
              (t === 'translate' && isPromptTemplateCustomised(settings.advanced.promptTemplate))}
            <li class="task-row" data-ega-task-item={t}>
              <Checkbox
                id={`ega-task-toggle-${t}`}
                label={TASK_LABELS[t]}
                checked={!view.disabled}
                inputAttrs={{ 'data-ega-task-toggle': t, disabled: t === 'translate' }}
                onchange={(on) => void toggle(t, on)}
              />
              <span class="badge">Built-in</span>
              {#if t === 'translate'}<span class="task-note">always on</span>{/if}
              {#if edited}<span class="badge badge-edited">Edited</span>{/if}
              {#if view.disabled}<span class="badge badge-off">Off</span>{/if}
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
      description="Tasks you write yourself. Each one runs its own prompt."
    >
      {#snippet headerActions()}
        <Button
          size="sm"
          dataAttrs={{ 'data-ega-custom-task-new': true }}
          onclick={() => (editingCustom = 'new')}>New task</Button
        >
      {/snippet}
      {#if customViews.length === 0}
        <p class="tasks-help">No tasks of your own yet.</p>
      {:else}
        <ul class="task-list" data-ega-custom-task-list>
          {#each customViews as v (v.id)}
            <li class="task-row" data-ega-task-item={v.id}>
              <Checkbox
                id={`ega-task-toggle-${v.id}`}
                label={v.label}
                checked={!v.disabled}
                inputAttrs={{ 'data-ega-task-toggle': v.id }}
                onchange={(on) => void toggle(v.id, on)}
              />
              <span class="badge">Custom</span>
              {#if v.disabled}<span class="badge badge-off">Off</span>{/if}
              <span class="task-spacer"></span>
              <Button
                variant="ghost"
                size="sm"
                ariaLabel={`Edit ${v.label}`}
                dataAttrs={{ 'data-ega-task-edit': v.id }}
                onclick={() => (editingCustom = customTasks.find((c) => c.id === v.id) ?? null)}
                >Edit</Button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </SectionCard>

    <SectionCard
      title="Rules"
      description="Extra instructions Ega adds to the prompt, for every task or only some."
    >
      <div data-ega-setting="tasks.rules">
        {#if rulesOverBudget}
          <div class="rules-budget-warn" role="alert" data-ega-rules-budget-warn>
            Your rules are over the {RULES_BLOCK_WARN_BYTES / 1024} KB limit, so Ega drops the least specific
            ones from each request.
          </div>
        {/if}
        <RulesEditor
          rules={settings.advanced.rules}
          onUpdate={handlers.updateRules}
          taskViews={views}
        />
      </div>
    </SectionCard>

    {#if editingCustom}
      <CustomTaskDialog
        s={settings}
        row={editingCustom === 'new' ? undefined : editingCustom}
        onClose={() => (editingCustom = null)}
        onSaved={(next) => {
          if (next) onSetSettings(next);
          loadCustomTasks();
        }}
      />
    {/if}

    {#if editing}
      <TaskEditDialog
        s={settings}
        task={editing}
        onClose={() => (editing = null)}
        onSaved={onSetSettings}
      />
    {/if}
  {:else}
    <LoadingState rows={4} label="Loading tasks…" />
  {/if}
</section>

<style>
  .rules-budget-warn {
    margin-bottom: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-warning-fg);
    border-radius: var(--radius-md);
    color: var(--color-warning-fg);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }
  .tasks-help {
    margin: var(--space-1) 0 var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .task-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elevated);
  }
  .task-note {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .task-spacer {
    flex: 1 1 auto;
  }
  .badge-edited,
  .badge-off {
    background: transparent;
    color: var(--color-fg-subtle);
    border: 1px solid var(--color-border);
  }
</style>
