<script lang="ts">
  import type { Scope } from '@/shared/template-scope.types';
  import { getPreset } from '@/shared/presets';
  import { TASK_LABELS } from '@/shared/task-prompts';

  interface Props {
    scope: Scope;
  }

  const { scope }: Props = $props();

  const banner = $derived.by<{ label: string; target: string } | null>(() => {
    switch (scope.scope) {
      case 'global':
        return null;
      case 'task':
        return { label: 'Per-task override', target: TASK_LABELS[scope.task] };
      case 'preset':
        return {
          label: 'Per-language override',
          target: getPreset(scope.presetId)?.label ?? scope.presetId,
        };
      default:
        return scope satisfies never;
    }
  });
</script>

{#if banner}
  <div
    class="scope-banner"
    role="note"
    data-ega-template-scope-banner
    data-ega-template-scope={scope.scope}
  >
    <span class="scope-chip">{banner.label}</span>
    <span class="scope-target" title={banner.target}>{banner.target}</span>
  </div>
{/if}

<style>
  .scope-banner {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    max-width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .scope-chip {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--color-accent);
  }
  .scope-target {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
