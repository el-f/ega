<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import type { Task } from '@/shared/task-prompts';
  import type { SamplingSupport } from '@/shared/backends/sampling-caps';
  import { ALL_TASKS, TASK_LABELS } from '@/shared/task-prompts';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import ResetField from '@/shared/ui/ResetField.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import EffortSegmented from '@/options/components/EffortSegmented.svelte';

  type Effort = 'low' | 'medium' | 'high';

  interface Props {
    s: Settings;
    /** Resolved sampling support for the active (backend, model) pair —
     *  computed by the parent and made reactive there. */
    caps: SamplingSupport;
    /** Per-task support, from each task's own chain head; gates that task's override row. */
    taskCaps: Record<Task, SamplingSupport>;
    onSetGlobalTemperature: (v: number) => Promise<void>;
    onSetGlobalMaxTokens: (v: number) => Promise<void>;
    onSetGlobalReasoningEffort: (v: Effort) => Promise<void>;
    onSetTaskTemperature: (task: Task, v: number | null) => Promise<void>;
    onSetTaskMaxTokens: (task: Task, v: number | null) => Promise<void>;
    onSetTaskReasoningEffort: (task: Task, v: Effort | null) => Promise<void>;
  }

  const {
    s,
    caps,
    taskCaps,
    onSetGlobalTemperature,
    onSetGlobalMaxTokens,
    onSetGlobalReasoningEffort,
    onSetTaskTemperature,
    onSetTaskMaxTokens,
    onSetTaskReasoningEffort,
  }: Props = $props();

  const DEF = DEFAULT_SETTINGS;

  // Why temperature is off: native ignores all sampling, reasoning models
  // reject a non-default temperature. maxTokens is only off on native.
  const tempDisabledReason = $derived(
    caps.temperature
      ? null
      : caps.reasoningEffort
        ? 'Reasoning models ignore temperature — use Effort.'
        : 'Native CLI manages its own sampling.',
  );
  const maxTokDisabledReason = $derived(
    caps.maxTokens ? null : 'Native CLI manages its own sampling.',
  );
  // Rows are display:contents in one grid, so the column exists for every row or none.
  const anyTaskEffort = $derived(ALL_TASKS.some((task) => taskCaps[task].reasoningEffort));

  const genModified = $derived(
    isFieldModified('advanced.temperature', s) || isFieldModified('advanced.maxTokens', s),
  );
  async function resetGeneration(): Promise<void> {
    await onSetGlobalTemperature(DEF.advanced.temperature);
    await onSetGlobalMaxTokens(DEF.advanced.maxTokens);
  }

  const perTaskModifiedCount = $derived(
    Object.keys(s.taskTemperatures ?? {}).length +
      Object.keys(s.taskMaxTokens ?? {}).length +
      Object.keys(s.taskReasoningEfforts ?? {}).length,
  );
  async function resetAllPerTask(): Promise<void> {
    for (const t of ALL_TASKS) {
      if (s.taskTemperatures?.[t] != null) await onSetTaskTemperature(t, null);
      if (s.taskMaxTokens?.[t] != null) await onSetTaskMaxTokens(t, null);
      if (s.taskReasoningEfforts?.[t] != null) await onSetTaskReasoningEffort(t, null);
    }
  }

  function parseTempInput(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(2, n));
  }
  function parseMaxTokInput(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.max(16, Math.min(8192, Math.floor(n)));
  }
</script>

<div class="generation-pane-root">
  <div data-ega-generation-card>
    <SectionCard title="Generation" description="Default temperature and max tokens.">
      {#snippet headerActions()}
        <SectionReset
          modified={genModified}
          onReset={resetGeneration}
          ariaLabel="Reset Generation section to defaults"
        />
      {/snippet}
      <div data-ega-setting="advanced.temperature">
        <Slider
          label="Temperature"
          value={s.advanced.temperature}
          min={0}
          max={2}
          step={0.05}
          help={`0 = most predictable, 2 = most varied. Default ${DEF.advanced.temperature}. Above ~1.2 answers can come back broken; 0 may loop on some backends.`}
          modified={isFieldModified('advanced.temperature', s)}
          disabled={!caps.temperature}
          {...tempDisabledReason !== null
            ? { describedById: 'gen-temp-disabled' }
            : {
                onReset: () => void onSetGlobalTemperature(DEF.advanced.temperature),
                resetAriaLabel: 'Reset temperature',
                resetInheritedLabel: `Default ${DEF.advanced.temperature}`,
              }}
          onchange={(v) => void onSetGlobalTemperature(v)}
        />
        {#if tempDisabledReason !== null}
          <p id="gen-temp-disabled" class="disabled-reason" data-ega-disabled-reason>
            {tempDisabledReason}
          </p>
        {/if}
      </div>

      <div data-ega-setting="advanced.maxTokens">
        <Slider
          label="Max tokens"
          value={s.advanced.maxTokens}
          min={16}
          max={8192}
          step={16}
          help={`Output length cap. Default ${DEF.advanced.maxTokens}. Below 256 tokens, long answers can get cut short and lose the confidence score and language detection.`}
          modified={isFieldModified('advanced.maxTokens', s)}
          disabled={!caps.maxTokens}
          {...maxTokDisabledReason !== null
            ? { describedById: 'gen-maxtok-disabled' }
            : {
                onReset: () => void onSetGlobalMaxTokens(DEF.advanced.maxTokens),
                resetAriaLabel: 'Reset max tokens',
                resetInheritedLabel: `Default ${DEF.advanced.maxTokens}`,
              }}
          onchange={(v) => void onSetGlobalMaxTokens(v)}
        />
        {#if maxTokDisabledReason !== null}
          <p id="gen-maxtok-disabled" class="disabled-reason" data-ega-disabled-reason>
            {maxTokDisabledReason}
          </p>
        {/if}
      </div>

      {#if caps.reasoningEffort}
        <div data-ega-setting="advanced.reasoningEffort" class="effort-block">
          <span class="effort-label" id="gen-effort-label">Reasoning effort</span>
          <EffortSegmented
            value={s.advanced.reasoningEffort}
            ariaLabel="Reasoning effort"
            onchange={(v) => void onSetGlobalReasoningEffort(v)}
          />
          <p class="effort-help">
            How hard the reasoning model thinks before answering. Higher = slower, costlier, more
            thorough.
          </p>
        </div>
      {/if}
    </SectionCard>
  </div>

  <div data-ega-per-task-overrides-card>
    <SectionCard
      title="Per-task overrides"
      description="Override the global values for one task. Leave a field blank to use the global value."
    >
      {#snippet headerActions()}
        <SectionReset
          modified={perTaskModifiedCount > 0}
          onReset={resetAllPerTask}
          ariaLabel="Clear every per-task override"
        />
      {/snippet}
      <div
        class="overrides-grid"
        class:with-effort={anyTaskEffort}
        role="table"
        aria-label="Per-task generation overrides"
      >
        <div class="overrides-head" role="row">
          <span role="columnheader">Task</span>
          <span role="columnheader">Temperature</span>
          <span role="columnheader">Max tokens</span>
          {#if anyTaskEffort}
            <span role="columnheader">Effort</span>
          {/if}
        </div>
        {#each ALL_TASKS as task (task)}
          {@const rowCaps = taskCaps[task]}
          {@const tempVal = s.taskTemperatures?.[task]}
          {@const maxTokVal = s.taskMaxTokens?.[task]}
          {@const effortVal = s.taskReasoningEfforts?.[task]}
          <div class="overrides-row" role="row" data-ega-pertask-row={task}>
            <span class="task-name" role="rowheader">{TASK_LABELS[task]}</span>
            <span class="cell" role="cell">
              <input
                type="number"
                class="num-input"
                min="0"
                max="2"
                step="0.05"
                value={tempVal ?? ''}
                placeholder="inherit"
                disabled={!rowCaps.temperature}
                aria-label={`Temperature override for ${TASK_LABELS[task]}`}
                data-ega-pertask-temp={task}
                onchange={(e) => {
                  const v = parseTempInput((e.currentTarget as HTMLInputElement).value);
                  void onSetTaskTemperature(task, v);
                }}
              />
              <ResetField
                differsFromInherited={tempVal != null}
                onReset={() => onSetTaskTemperature(task, null)}
                ariaLabel={`Clear temperature override for ${TASK_LABELS[task]}`}
              />
            </span>
            <span class="cell" role="cell">
              <input
                type="number"
                class="num-input"
                min="16"
                max="8192"
                step="16"
                value={maxTokVal ?? ''}
                placeholder="inherit"
                disabled={!rowCaps.maxTokens}
                aria-label={`Max tokens override for ${TASK_LABELS[task]}`}
                data-ega-pertask-max={task}
                onchange={(e) => {
                  const v = parseMaxTokInput((e.currentTarget as HTMLInputElement).value);
                  void onSetTaskMaxTokens(task, v);
                }}
              />
              <ResetField
                differsFromInherited={maxTokVal != null}
                onReset={() => onSetTaskMaxTokens(task, null)}
                ariaLabel={`Clear max tokens override for ${TASK_LABELS[task]}`}
              />
            </span>
            {#if anyTaskEffort}
              <span class="cell" role="cell" data-ega-pertask-effort={task}>
                {#if rowCaps.reasoningEffort}
                  <EffortSegmented
                    value={effortVal ?? s.advanced.reasoningEffort}
                    ariaLabel={`Reasoning effort override for ${TASK_LABELS[task]}`}
                    onchange={(v) => void onSetTaskReasoningEffort(task, v)}
                  />
                  <ResetField
                    differsFromInherited={effortVal != null}
                    onReset={() => onSetTaskReasoningEffort(task, null)}
                    ariaLabel={`Clear reasoning effort override for ${TASK_LABELS[task]}`}
                  />
                {/if}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </SectionCard>
  </div>
</div>

<style>
  .generation-pane-root {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  .disabled-reason {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
  .effort-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: var(--space-3) 0;
  }
  .effort-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .effort-help {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
  .overrides-grid {
    display: grid;
    grid-template-columns: minmax(8rem, max-content) repeat(2, 1fr);
    gap: var(--space-1) var(--space-3);
    align-items: center;
  }
  .overrides-grid.with-effort {
    grid-template-columns: minmax(8rem, max-content) repeat(3, 1fr);
  }
  .overrides-head {
    display: contents;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .overrides-head > span {
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .overrides-row {
    display: contents;
  }
  .task-name {
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .cell {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .num-input {
    width: 100%;
    max-width: 8rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
  }
  .num-input:disabled {
    background: var(--color-bg-disabled);
    border-color: var(--color-border-disabled);
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  .num-input:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
</style>
