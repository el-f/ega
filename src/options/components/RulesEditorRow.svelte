<script lang="ts">
  import type { Rule, RuleCategory } from '@/shared/rules';
  import { TASK_LABELS, type Task } from '@/shared/task-prompts';
  import Button from '@/shared/ui/Button.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import Textarea from '@/shared/ui/Textarea.svelte';
  import { RULE_BODY_MAX } from '@/shared/settings-schema';
  import { sourceLabel, sourceVariant } from './rules-source-label';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Power from '@lucide/svelte/icons/power';

  interface Props {
    rule: Rule;
    onBodyChange: (body: string) => void | Promise<void>;
    onCategoryChange: (category: RuleCategory) => void | Promise<void>;
    onToggleEnabled: () => void | Promise<void>;
    onToggleTask: (task: Task) => void | Promise<void>;
    onRemoveSite: (site: string) => void | Promise<void>;
    onDelete: () => void | Promise<void>;
  }

  const {
    rule,
    onBodyChange,
    onCategoryChange,
    onToggleEnabled,
    onToggleTask,
    onRemoveSite,
    onDelete,
  }: Props = $props();

  const CATEGORIES: readonly RuleCategory[] = ['always', 'never', 'prefer', 'format', 'unknown'];

  let editing = $state(false);
  let editingDraft = $state('');

  function startEdit(): void {
    editing = true;
    editingDraft = rule.body;
  }

  async function commitEdit(): Promise<void> {
    const trimmed = editingDraft.trim();
    editing = false;
    if (trimmed.length === 0 || trimmed === rule.body) return;
    await onBodyChange(trimmed);
  }

  function cancelEdit(): void {
    editing = false;
    editingDraft = '';
  }

  function categoryLabel(c: RuleCategory): string {
    return c === 'unknown' ? 'unknown' : c;
  }
</script>

<li class="rule-row" data-ega-rule-row data-rule-id={rule.id} class:disabled={!rule.enabled}>
  <div class="rule-main">
    {#if editing}
      <Textarea
        rows={2}
        maxlength={RULE_BODY_MAX}
        bind:value={editingDraft}
        onblur={() => void commitEdit()}
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void commitEdit();
          }
        }}
        dataAttrs={{
          'data-ega-rule-body-editor': 'true',
          'aria-label': 'Edit rule text',
        }}
      />
    {:else}
      <button
        type="button"
        class="body"
        onclick={startEdit}
        title="Click to edit"
        data-ega-rule-body
      >
        {rule.body}
        <Pencil size={12} class="edit-glyph" aria-hidden="true" />
      </button>
    {/if}
    <div class="rule-meta">
      <select
        class="cat-select cat-{rule.category}"
        value={rule.category}
        onchange={(e) => {
          const t = e.currentTarget as HTMLSelectElement;
          void onCategoryChange(t.value as RuleCategory);
        }}
        aria-label="Category"
        data-ega-rule-category
      >
        {#each CATEGORIES as c (c)}
          <option value={c}>{categoryLabel(c)}</option>
        {/each}
      </select>

      <div class="scope-chips" aria-label="Scope">
        {#if rule.scope.tasks.length === 0}
          <span class="scope-all" title="Applies to all tasks">
            <Badge variant="muted">all tasks</Badge>
          </span>
        {:else}
          {#each rule.scope.tasks as t (t)}
            <Button
              variant="ghost"
              size="sm"
              title="Click to remove"
              ariaLabel={`Remove task ${TASK_LABELS[t]}`}
              extraClass="scope-chip"
              dataAttrs={{ 'data-ega-rule-task-chip': t }}
              onclick={() => void onToggleTask(t)}
            >
              {TASK_LABELS[t]} ×
            </Button>
          {/each}
        {/if}
        {#if rule.scope.sites && rule.scope.sites.length > 0}
          <!-- Keyed by index, not by site: a stored rule can hold a duplicate site, and a duplicate key throws. -->
          {#each rule.scope.sites as s, i (i)}
            <Button
              variant="ghost"
              size="sm"
              title="Click to remove"
              ariaLabel={`Remove site ${s}`}
              extraClass="scope-chip site"
              dataAttrs={{ 'data-ega-rule-site-chip': s }}
              onclick={() => void onRemoveSite(s)}
            >
              {s} ×
            </Button>
          {/each}
        {/if}
      </div>

      {#if sourceLabel(rule)}
        <span
          data-ega-rule-source
          title={rule.source === 'recipe' && rule.recipeId
            ? `recipe: ${rule.recipeId}`
            : sourceLabel(rule)}
        >
          <Badge variant={sourceVariant(rule)}>{sourceLabel(rule)}</Badge>
        </span>
      {/if}
    </div>
  </div>

  <div class="rule-actions">
    <IconButton
      icon={Power}
      ariaLabel={rule.enabled ? 'Disable rule' : 'Enable rule'}
      tooltip={rule.enabled ? 'Disable' : 'Enable'}
      size="sm"
      variant={rule.enabled ? 'primary' : 'default'}
      dataAttrs={{
        'data-ega-rule-disable': 'true',
        'aria-pressed': rule.enabled ? 'true' : 'false',
      }}
      onclick={() => void onToggleEnabled()}
    />
    <IconButton
      icon={Trash2}
      ariaLabel="Delete rule"
      tooltip="Delete"
      size="sm"
      variant="danger"
      dataAttrs={{ 'data-ega-rule-delete': 'true' }}
      onclick={() => void onDelete()}
    />
  </div>
</li>

<style>
  .rule-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elevated);
  }
  .rule-row.disabled {
    opacity: 0.55;
    border-style: dashed;
  }
  .rule-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }
  .body {
    text-align: left;
    background: transparent;
    border: 0;
    padding: 0;
    color: var(--color-fg);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    cursor: text;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }
  .body :global(.edit-glyph) {
    color: var(--color-fg-subtle);
    opacity: 0;
    transition: opacity var(--motion-fast) var(--ease-out);
  }
  .body:hover :global(.edit-glyph),
  .body:focus-visible :global(.edit-glyph) {
    opacity: 1;
  }
  .body:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .rule-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .cat-select {
    padding: 1px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg);
    color: var(--color-fg);
    font-size: var(--fs-xs);
    cursor: pointer;
  }
  .cat-select:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .cat-always {
    color: var(--color-success, var(--color-accent));
  }
  .cat-never {
    color: var(--color-danger);
  }
  .cat-prefer,
  .cat-format,
  .cat-unknown {
    color: var(--color-fg-subtle);
  }
  .scope-chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
  }
  .scope-chips :global(.ega-btn.scope-chip) {
    padding: 1px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-fg-subtle);
  }
  .scope-chips :global(.ega-btn.scope-chip:hover:not(:disabled)) {
    border-color: var(--color-danger);
    color: var(--color-danger);
    background: transparent;
  }
  .scope-chips :global(.ega-btn.scope-chip.site) {
    font-family: var(--font-mono);
  }
  .rule-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
</style>
