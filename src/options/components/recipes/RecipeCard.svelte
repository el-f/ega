<script lang="ts">
  import type { Recipe } from '@/shared/recipes';
  import { TASK_LABELS } from '@/shared/task-prompts';
  import Button from '@/shared/ui/Button.svelte';
  import Badge from '@/shared/ui/Badge.svelte';

  interface Props {
    recipe: Recipe;
    /** When true, exposes Export + Delete affordances. Bundled cards omit them. */
    isUser: boolean;
    onApply: (r: Recipe) => void;
    onApplyRulesOnly: (r: Recipe) => void;
    onExport?: (r: Recipe) => void;
    onDelete?: (r: Recipe) => void;
  }

  const { recipe, isUser, onApply, onApplyRulesOnly, onExport, onDelete }: Props = $props();

  const ruleCount = $derived(recipe.rules?.length ?? 0);
  // "Apply all" only reads correctly when there is more than one thing to apply.
  const applyLabel = $derived(ruleCount > 1 ? 'Apply all' : 'Apply');
  // With zero or one rule, "Apply" already covers what this button would do.
  const showRulesOnlyButton = $derived(ruleCount > 1);
</script>

<li class="card" data-ega-recipe-card data-ega-recipe-id={recipe.id}>
  <div class="card-head">
    <div class="title">{recipe.label}</div>
    <div class="badges">
      <Badge variant="default">{TASK_LABELS[recipe.task]}</Badge>
      {#if ruleCount > 0}
        <Badge variant="muted">
          {ruleCount} rule{ruleCount === 1 ? '' : 's'}
        </Badge>
      {/if}
      {#if recipe.template}
        <Badge variant="warning">template</Badge>
      {/if}
      {#if recipe.generationParams}
        <Badge variant="muted">settings</Badge>
      {/if}
    </div>
  </div>
  <p class="desc">{recipe.description}</p>
  <div class="card-actions">
    <Button
      variant="primary"
      size="sm"
      title="Apply the whole recipe: template, rules and generation settings"
      dataAttrs={{ 'data-ega-recipe-apply': 'true' }}
      onclick={() => onApply(recipe)}
    >
      {applyLabel}
    </Button>
    {#if showRulesOnlyButton}
      <Button
        variant="secondary"
        size="sm"
        title="Add the recipe's rules to your rules. Template, temperature and tone stay as they are."
        dataAttrs={{ 'data-ega-recipe-rules-only': 'true' }}
        onclick={() => onApplyRulesOnly(recipe)}
      >
        Add rules
      </Button>
    {/if}
    {#if isUser}
      <Button
        variant="secondary"
        size="sm"
        dataAttrs={{ 'data-ega-recipe-export': 'true' }}
        onclick={() => onExport?.(recipe)}
      >
        Export
      </Button>
      <Button
        variant="danger"
        size="sm"
        dataAttrs={{ 'data-ega-recipe-delete': 'true' }}
        onclick={() => onDelete?.(recipe)}
      >
        Delete
      </Button>
    {/if}
  </div>
</li>

<style>
  /* Compact mode targets ~72px per card, so the bundled-recipes list fits one viewport. */
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .card-head {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    /* Badges drop to their own line before the title starts truncating. */
    flex-wrap: wrap;
    row-gap: var(--space-1);
  }
  .title {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-fg);
    flex: 1 1 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badges {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .desc {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-tight, 1.3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }
</style>
