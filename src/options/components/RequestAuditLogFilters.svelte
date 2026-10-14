<script lang="ts">
  /** One filter row: Status, Task, Backend, then a search over prompts, replies and errors. */
  import Search from '@lucide/svelte/icons/search';
  import Select from '@/shared/ui/Select.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import { getRegisteredBackendIds } from '@/shared/backends/registry';
  import type { TaskView } from '@/shared/task-view';
  import {
    auditBackendLabel,
    auditTaskIds,
    auditTaskLabel,
    type AuditFilters,
    type AuditFilterStatus,
  } from './audit-filters';

  interface Props {
    filters: AuditFilters;
    onChange: (next: AuditFilters) => void;
    /** Every task, on or off; names custom tasks. */
    taskViews?: readonly TaskView[];
    /** Task ids the entries carry, so a deleted task can still be filtered on. */
    seenTasks?: readonly string[];
  }

  const { filters, onChange, taskViews = [], seenTasks = [] }: Props = $props();

  const statusOptions: ReadonlyArray<{ value: AuditFilterStatus; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'ok', label: 'OK' },
    { value: 'error', label: 'Errors' },
    { value: 'cache', label: 'From cache' },
  ];

  const taskOptions = $derived([
    { value: 'all', label: 'All' },
    ...auditTaskIds(taskViews, seenTasks).map((t) => ({
      value: t,
      label: auditTaskLabel(t, taskViews),
    })),
  ]);

  // 'unknown' marks a row no backend answered; an 'auto' row comes only from old builds and shows under All.
  const backendOptions = [
    { value: 'all', label: 'All' },
    ...getRegisteredBackendIds().map((id) => ({ value: id, label: auditBackendLabel(id) })),
    { value: 'unknown', label: 'Ega (no backend)' },
  ];
</script>

<div class="audit-filters" data-ega-audit-filters>
  <Select
    label="Status"
    value={filters.status}
    options={statusOptions}
    selectAttrs={{ 'data-ega-audit-filter-status': '' }}
    size="sm"
    onchange={(v) => onChange({ ...filters, status: v })}
  />
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
  <div class="audit-filter-query">
    <Input
      label="Search requests"
      value={filters.query}
      size="sm"
      dataAttrs={{ 'data-ega-audit-filter-query': true }}
      oninput={(e) => onChange({ ...filters, query: (e.currentTarget as HTMLInputElement).value })}
    >
      {#snippet leading()}<Search size={16} />{/snippet}
    </Input>
  </div>
</div>

<style>
  .audit-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-2) var(--space-3);
  }
  .audit-filter-query {
    flex: 1 1 220px;
  }
</style>
