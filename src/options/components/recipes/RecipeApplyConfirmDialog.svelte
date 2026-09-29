<script lang="ts">
  import type { Recipe } from '@/shared/recipes';
  import { TASK_LABELS, TONE_LABELS } from '@/shared/task-prompts';
  import Button from '@/shared/ui/Button.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';

  interface Props {
    recipe: Recipe;
    onCancel: () => void;
    onConfirm: () => void;
  }

  const { recipe, onCancel, onConfirm }: Props = $props();

  const ruleCount = $derived(recipe.rules?.length ?? 0);

  const paramChanges = $derived.by((): readonly string[] => {
    const gp = recipe.generationParams;
    if (!gp) return [];
    const parts: string[] = [];
    if (gp.temperature !== undefined) parts.push(`temperature to ${gp.temperature}`);
    if (gp.maxTokens !== undefined) parts.push(`max tokens to ${gp.maxTokens}`);
    if (gp.tone !== undefined) parts.push(`tone to ${TONE_LABELS[gp.tone]}`);
    return parts;
  });
</script>

<Dialog open={true} title={`Apply "${recipe.label}"?`} onClose={onCancel} size="md">
  {#snippet help()}
    This will change the active configuration for {TASK_LABELS[recipe.task]}:
  {/snippet}
  {#snippet actions()}
    <Button variant="secondary" onclick={onCancel}>Cancel</Button>
    <Button variant="primary" onclick={onConfirm}>Apply</Button>
  {/snippet}
  <ul class="diff-list">
    {#if recipe.template}
      <li class="diff-row diff-warn">
        <Badge variant="warning">template</Badge>
        <span>Overwrite the current template (system + user prompts).</span>
      </li>
    {/if}
    {#if ruleCount > 0}
      <li class="diff-row">
        <Badge variant="muted">+{ruleCount} rule{ruleCount === 1 ? '' : 's'}</Badge>
        <ul class="rule-preview">
          {#each recipe.rules ?? [] as rule (rule.body)}
            <li>
              <span class="rule-cat cat-{rule.category}">{rule.category}</span>
              {rule.body}
            </li>
          {/each}
        </ul>
      </li>
    {/if}
    {#if paramChanges.length > 0}
      <li class="diff-row">
        <Badge variant="muted">settings</Badge>
        <span>Set {paramChanges.join(', ')}.</span>
      </li>
    {/if}
  </ul>
</Dialog>

<style>
  .diff-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .diff-row {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    font-size: var(--fs-sm);
    color: var(--color-fg);
    line-height: var(--lh-body);
  }
  .diff-row.diff-warn {
    color: var(--color-warning-fg, var(--color-fg));
  }
  .rule-preview {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .rule-cat {
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10px;
    margin-right: var(--space-1);
  }
  .rule-cat.cat-always {
    color: var(--color-success-fg, var(--color-accent));
  }
  .rule-cat.cat-never {
    color: var(--color-danger-fg);
  }
</style>
