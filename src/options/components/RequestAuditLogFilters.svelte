<script lang="ts">
  import { TASK_LABELS, type Task } from '@/shared/task-prompts';
  import { ALL_AUDIT_TASKS, AUDIT_ONLY_TASK_LABELS } from '@/shared/audit-log';
  import Select from '@/shared/ui/Select.svelte';
  import { getRegisteredBackendIds } from '@/shared/backends/registry';
  import type { AuditFilters } from './audit-filters';

  interface Props {
    filters: AuditFilters;
    onChange: (next: AuditFilters) => void;
  }

  const { filters, onChange }: Props = $props();

  // Quick-apply chip presets. Each chip atomically writes 1+ filter fields;
  // pressing the same chip clears just that chip's fields back to EMPTY.
  type ChipPreset = { id: string; label: string; patch: Partial<AuditFilters> };
  const PRESETS: readonly ChipPreset[] = [
    { id: 'errors', label: 'Errors only', patch: { status: 'error' } },
    { id: 'cache', label: 'Cache hits', patch: { status: 'cache' } },
    { id: 'ok', label: 'OK only', patch: { status: 'ok' } },
  ];

  // A chip is "active" iff every field in its patch matches current filters.
  function chipActive(p: ChipPreset): boolean {
    for (const k of Object.keys(p.patch) as (keyof AuditFilters)[]) {
      if (filters[k] !== p.patch[k]) return false;
    }
    return true;
  }

  function applyChip(p: ChipPreset): void {
    if (chipActive(p)) {
      // Reset only the patched fields back to empty defaults.
      const cleared: Partial<AuditFilters> = {};
      for (const k of Object.keys(p.patch) as (keyof AuditFilters)[]) {
        // Status is the only chip field today; falls back to 'all'.
        if (k === 'status') cleared.status = 'all';
        else if (k === 'task') cleared.task = 'all';
        else if (k === 'backend') cleared.backend = 'all';
        else if (k === 'query') cleared.query = '';
      }
      onChange({ ...filters, ...cleared });
      return;
    }
    onChange({ ...filters, ...p.patch });
  }

  const taskOptions = [
    { value: 'all' as const, label: 'All tasks' },
    ...ALL_AUDIT_TASKS.map((t) => ({
      value: t,
      label:
        t in AUDIT_ONLY_TASK_LABELS
          ? AUDIT_ONLY_TASK_LABELS[t as keyof typeof AUDIT_ONLY_TASK_LABELS]
          : TASK_LABELS[t as Task],
    })),
  ];

  const backendOptions = [
    { value: 'all', label: 'All backends' },
    ...getRegisteredBackendIds().map((id) => ({ value: id, label: id })),
    { value: 'auto', label: 'auto' },
    { value: 'unknown', label: 'unknown' },
  ];

  const statusOptions = [
    { value: 'all' as const, label: 'All statuses' },
    { value: 'ok' as const, label: 'OK' },
    { value: 'error' as const, label: 'Error' },
    { value: 'cache' as const, label: 'Cache hit' },
  ];
</script>

<div
  class="audit-filter-presets"
  role="group"
  aria-label="Quick filter presets"
  data-ega-audit-presets
>
  {#each PRESETS as p (p.id)}
    {@const active = chipActive(p)}
    <button
      type="button"
      class="audit-preset-chip"
      class:active
      aria-pressed={active}
      data-ega-audit-preset={p.id}
      onclick={() => applyChip(p)}
    >
      {p.label}
    </button>
  {/each}
</div>

<div class="audit-filters" data-ega-audit-filters>
  <Select
    label="Task"
    value={filters.task}
    options={taskOptions}
    selectAttrs={{ 'data-ega-audit-filter-task': '' }}
    size="sm"
    onchange={(v) => onChange({ ...filters, task: v })}
  />
  <Select
    label="Backend"
    value={filters.backend}
    options={backendOptions}
    selectAttrs={{ 'data-ega-audit-filter-backend': '' }}
    size="sm"
    onchange={(v) => onChange({ ...filters, backend: v })}
  />
  <Select
    label="Status"
    value={filters.status}
    options={statusOptions}
    selectAttrs={{ 'data-ega-audit-filter-status': '' }}
    size="sm"
    onchange={(v) => onChange({ ...filters, status: v })}
  />
  <label class="audit-filter-query">
    <span>Query</span>
    <input
      type="text"
      dir="auto"
      placeholder="Find in prompt / response / error"
      value={filters.query}
      data-ega-audit-filter-query
      onchange={(e) => onChange({ ...filters, query: (e.currentTarget as HTMLInputElement).value })}
      oninput={(e) => onChange({ ...filters, query: (e.currentTarget as HTMLInputElement).value })}
    />
  </label>
</div>

<style>
  .audit-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .audit-filter-query {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1 1 220px;
  }
  .audit-filter-query > span {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    font-weight: 500;
  }
  .audit-filter-query input {
    appearance: none;
    background-color: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-sm);
    font-family: var(--font-ui);
    line-height: 1.4;
  }
  .audit-filter-query input:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  .audit-filter-presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-1) 0;
  }
  .audit-preset-chip {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-size: var(--fs-xs);
    /* Constant across states so pressing a preset does not slide the chips after it. */
    font-weight: 500;
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .audit-preset-chip:hover {
    background: var(--color-bg-hover);
  }
  .audit-preset-chip.active {
    background: var(--color-accent-bg-soft);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .audit-preset-chip:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
</style>
