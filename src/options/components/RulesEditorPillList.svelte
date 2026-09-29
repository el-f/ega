<script lang="ts">
  import type { Rule } from '@/shared/rules';
  import { TASK_LABELS } from '@/shared/task-prompts';
  import Badge from '@/shared/ui/Badge.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import { sourceLabel, sourceVariant } from './rules-source-label';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Power from '@lucide/svelte/icons/power';

  interface Props {
    rules: readonly Rule[];
    onDelete: (id: string) => void | Promise<void>;
    onToggleEnabled: (id: string) => void | Promise<void>;
    newRuleId?: string | null;
  }

  const { rules, onDelete, onToggleEnabled, newRuleId = null }: Props = $props();

  const BODY_EXCERPT_LIMIT = 60;

  function excerpt(body: string): string {
    if (body.length <= BODY_EXCERPT_LIMIT) return body;
    return body.slice(0, BODY_EXCERPT_LIMIT) + '…';
  }

  function scopeSummary(r: Rule): string {
    const tasksPart =
      r.scope.tasks.length === 0
        ? 'all tasks'
        : r.scope.tasks.map((t) => TASK_LABELS[t]).join(', ');
    if (r.scope.sites && r.scope.sites.length > 0) {
      const sitesPart =
        r.scope.sites.length === 1 ? r.scope.sites[0] : `${r.scope.sites.length} sites`;
      return `${tasksPart} · ${sitesPart}`;
    }
    return tasksPart;
  }

  type CategoryVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted';
  function categoryVariant(c: Rule['category']): CategoryVariant {
    if (c === 'always') return 'success';
    if (c === 'never') return 'danger';
    if (c === 'prefer') return 'default';
    if (c === 'format') return 'default';
    return 'muted';
  }
</script>

<ul class="rule-pill-list" role="list" data-ega-rule-pill-list>
  {#each rules as r (r.id)}
    <li
      class="rule-pill"
      class:disabled={!r.enabled}
      class:new-flash={r.id === newRuleId}
      data-ega-rule-pill
      data-rule-id={r.id}
      data-ega-new-rule={r.id === newRuleId ? r.id : undefined}
    >
      <span class="cat" data-ega-rule-pill-category>
        <Badge variant={categoryVariant(r.category)}>{r.category}</Badge>
      </span>
      <span class="body" title={r.body} data-ega-rule-pill-body>{excerpt(r.body)}</span>
      <span class="scope" data-ega-rule-pill-scope>·{scopeSummary(r)}·</span>
      <span class="source" data-ega-rule-pill-source>
        <Badge variant={sourceVariant(r)}>{sourceLabel(r)}</Badge>
      </span>
      <span class="actions">
        <IconButton
          icon={Power}
          ariaLabel={r.enabled ? 'Disable rule' : 'Enable rule'}
          tooltip={r.enabled ? 'Disable' : 'Enable'}
          size="sm"
          variant={r.enabled ? 'primary' : 'default'}
          dataAttrs={{
            'data-ega-rule-pill-disable': 'true',
            'aria-pressed': r.enabled ? 'true' : 'false',
          }}
          onclick={() => void onToggleEnabled(r.id)}
        />
        <IconButton
          icon={Trash2}
          ariaLabel="Delete rule"
          tooltip="Delete"
          size="sm"
          variant="danger"
          dataAttrs={{ 'data-ega-rule-pill-delete': 'true' }}
          onclick={() => void onDelete(r.id)}
        />
      </span>
    </li>
  {/each}
</ul>

<style>
  .rule-pill-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .rule-pill {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    min-width: 0;
  }
  .rule-pill.disabled {
    opacity: 0.55;
    border-style: dashed;
  }
  .rule-pill.new-flash {
    animation: rule-entry-flash 600ms ease-out forwards;
  }
  @keyframes rule-entry-flash {
    0% {
      background: var(--color-accent-bg-soft);
    }
    100% {
      background: var(--color-bg-elevated);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rule-pill.new-flash {
      animation: none;
    }
  }
  .body {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--color-fg);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .scope {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    white-space: nowrap;
  }
  .cat,
  .source {
    flex: 0 0 auto;
  }
  .actions {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
  }
</style>
