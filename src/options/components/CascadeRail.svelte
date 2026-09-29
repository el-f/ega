<script lang="ts">
  import type { Settings } from '@/shared/types';
  import type { Task } from '@/shared/task-prompts';
  import { TASK_LABELS } from '@/shared/task-prompts';
  import { DEFAULT_TEMPLATE } from '@/shared/prompts';

  interface Props {
    s: Settings;
    /** Active task chip — only renders for 'global' + task chips. */
    chip: 'global' | Task;
    /** Jump to a layer's surface; fromChip names the task row to highlight. */
    onJumpToLayer?: (
      layer: 'global' | 'per-task' | 'per-preset',
      fromChip: 'global' | Task,
    ) => void;
  }

  const { s, chip, onJumpToLayer }: Props = $props();

  // The rail stays meaningful on the global chip, so a user sees a per-task override without leaving global.
  const globalCustomised = $derived(
    s.advanced.promptTemplate.system !== DEFAULT_TEMPLATE.system ||
      s.advanced.promptTemplate.user !== DEFAULT_TEMPLATE.user,
  );

  // Per-task layer applies only to non-global chips. For 'global' the
  // layer collapses to "n/a" (rendered as a muted "—").
  const perTaskCustomised = $derived(
    chip !== 'global' && Boolean(s.advanced.taskTemplates?.[chip]),
  );

  // The config card shows the resolved winner; this rail only shows whether an override exists.
  const perPresetCustomised = $derived(Object.keys(s.advanced.perPresetTemplates ?? {}).length > 0);

  const chipLabel = $derived(chip === 'global' ? 'Global' : (TASK_LABELS[chip] ?? chip));
</script>

<nav class="cascade-rail" aria-label="Template cascade for {chipLabel}" data-ega-cascade-rail>
  <button
    type="button"
    class="cascade-pill"
    class:customised={globalCustomised}
    data-ega-cascade-layer="global"
    onclick={() => onJumpToLayer?.('global', chip)}
  >
    <span class="layer-label">Global</span>
    <span class="layer-state">{globalCustomised ? 'customized' : 'inherited'}</span>
  </button>
  {#if chip !== 'global'}
    <button
      type="button"
      class="cascade-pill"
      class:customised={perTaskCustomised}
      data-ega-cascade-layer="per-task"
      onclick={() => onJumpToLayer?.('per-task', chip)}
    >
      <span class="layer-label">{chipLabel} override</span>
      <span class="layer-state">{perTaskCustomised ? 'customized' : 'inherited'}</span>
    </button>
  {/if}
  <button
    type="button"
    class="cascade-pill"
    class:customised={perPresetCustomised}
    data-ega-cascade-layer="per-preset"
    onclick={() => onJumpToLayer?.('per-preset', chip)}
  >
    <span class="layer-label">Per-language</span>
    <span class="layer-state">{perPresetCustomised ? 'customized' : 'inherited'}</span>
  </button>
</nav>

<style>
  .cascade-rail {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
    padding: var(--space-1) 0;
    margin-bottom: var(--space-2);
    font-size: var(--fs-xs);
  }
  .cascade-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    color: var(--color-muted);
    font-family: inherit;
    font-size: var(--fs-xs);
    line-height: 1.3;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }
  .cascade-pill:hover:not(:disabled) {
    color: var(--color-fg);
    border-color: var(--color-border-strong, var(--color-border));
  }
  .cascade-pill:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .cascade-pill.customised {
    border-color: var(--color-accent);
    color: var(--color-fg);
    background: var(--color-accent-bg-soft);
  }
  .cascade-pill:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .layer-label {
    font-weight: 500;
  }
  .layer-state {
    color: var(--color-fg-subtle);
    font-style: italic;
  }
  .cascade-pill.customised .layer-state {
    color: var(--color-accent);
    font-style: normal;
    font-weight: 500;
  }
  /* The separator leads each pill rather than trailing it, so a wrapped row never ends with a stray chevron. */
  .cascade-pill + .cascade-pill::before {
    content: '›';
    color: var(--color-fg-subtle);
    margin-right: var(--space-1);
    user-select: none;
  }
</style>
