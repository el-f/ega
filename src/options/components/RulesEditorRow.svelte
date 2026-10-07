<script lang="ts">
  /** One rule: its on/off box with the full text, a meta line, and Edit, which opens the fields below. */
  import type { Rule } from '@/shared/rules';
  import type { TaskView } from '@/shared/task-view';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import { scrollBehavior } from '@/options/deep-link';
  import RuleEditor from './rules/RuleEditor.svelte';
  import { ruleMeta, type RuleDraft } from './rules/rule-fields';

  interface Props {
    rule: Rule;
    taskViews: readonly TaskView[];
    open: boolean;
    onToggleOpen: () => void;
    onToggleEnabled: () => void | Promise<void>;
    /** Writes one changed part; false when the write failed. */
    onCommit: (patch: Partial<RuleDraft>) => Promise<boolean>;
    onDelete: () => void | Promise<void>;
    /** Pulse and scroll into view once: the row was just added. */
    highlight?: boolean;
  }

  const {
    rule,
    taskViews,
    open,
    onToggleOpen,
    onToggleEnabled,
    onCommit,
    onDelete,
    highlight = false,
  }: Props = $props();

  let rowEl = $state<HTMLElement | null>(null);
  const editorId = $derived(`ega-rule-editor-${rule.id}`);
  // Every row has an Edit button, so its name carries the start of the rule.
  const shortBody = $derived(
    rule.body.length > 40 ? `${rule.body.slice(0, 40).trimEnd()}…` : rule.body,
  );

  $effect(() => {
    if (highlight) rowEl?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  });
</script>

<li
  class="rule-row"
  bind:this={rowEl}
  data-ega-rule-row
  data-rule-id={rule.id}
  class:just-added={highlight}
>
  <div class="rule-line">
    <div class="rule-text">
      <Checkbox
        checked={rule.enabled}
        label={rule.body}
        inputAttrs={{ 'aria-label': `Use rule: ${rule.body}`, 'data-ega-rule-disable': true }}
        onchange={() => void onToggleEnabled()}
      />
      <p class="rule-meta" data-ega-rule-meta>{ruleMeta(rule, taskViews)}</p>
    </div>
    <Button
      variant="ghost"
      size="sm"
      ariaLabel={`${open ? 'Close' : 'Edit'} rule: ${shortBody}`}
      dataAttrs={{
        'data-ega-rule-edit': true,
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': editorId,
      }}
      onclick={onToggleOpen}>{open ? 'Close' : 'Edit'}</Button
    >
  </div>
  {#if open}
    <div class="rule-editor-wrap" id={editorId}>
      <RuleEditor
        mode="edit"
        initial={{
          body: rule.body,
          category: rule.category,
          tasks: [...rule.scope.tasks],
          sites: [...(rule.scope.sites ?? [])],
        }}
        {taskViews}
        {onCommit}
        {onDelete}
        onClose={onToggleOpen}
      />
    </div>
  {/if}
</li>

<style>
  .rule-row {
    padding-block: var(--space-2);
  }
  .rule-row + :global(.rule-row) {
    border-top: 1px solid var(--color-border-subtle);
  }
  .rule-row.just-added {
    animation: ega-success-pulse 1.2s var(--ease-out) 1;
  }
  .rule-line {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .rule-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .rule-meta {
    margin: 2px 0 0;
    padding-inline-start: calc(16px + var(--space-2));
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .rule-editor-wrap {
    padding-inline-start: calc(16px + var(--space-2));
  }
</style>
