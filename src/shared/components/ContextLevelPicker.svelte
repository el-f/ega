<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  // Minimal / Rich only — `contextEnabled` owns the off state. The write is the same
  // `updateSettings` the Answers tab uses, so it is global, not per-session.

  type Level = 'minimal' | 'rich';

  interface Props {
    value: Level;
    onchange: (level: Level) => void;
  }

  let { value, onchange }: Props = $props();

  // Least context first, matching the radio order in Options so both surfaces read the same way.
  const LEVELS: ReadonlyArray<{ id: Level; label: string; hint: string }> = [
    {
      id: 'minimal',
      label: 'Minimal',
      hint: 'Page title and URL.',
    },
    {
      id: 'rich',
      label: 'Rich',
      hint: 'Also the page language, description, site name and headings.',
    },
  ];

  const activeHint = $derived(LEVELS.find((l) => l.id === value)?.hint ?? '');

  function selectLevel(next: Level): void {
    if (next !== value) onchange(next);
  }
</script>

<div class="ctx-level" data-ega-ctx-level>
  <div class="ctx-level-row">
    <span class="ctx-level-label" id="ctx-level-label">Page info</span>
    <!-- aria-pressed, not aria-checked: aria-checked would need the container to be a radiogroup. -->
    <div
      class="ctx-level-toggle"
      role="group"
      aria-labelledby="ctx-level-label"
      aria-describedby="ctx-level-hint"
    >
      {#each LEVELS as lvl (lvl.id)}
        <button
          type="button"
          aria-pressed={value === lvl.id}
          class:active={value === lvl.id}
          data-ega-ctx-level-value={lvl.id}
          onclick={() => selectLevel(lvl.id)}
        >
          <!-- The check, not only the colour, says which level is picked, as on the task chips. -->
          {#if value === lvl.id}<Check size={16} aria-hidden="true" />{/if}{lvl.label}
        </button>
      {/each}
    </div>
  </div>
  <p class="ctx-level-hint" id="ctx-level-hint">{activeHint}</p>
</div>

<style>
  .ctx-level {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ctx-level-hint {
    margin: 0;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .ctx-level-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .ctx-level-label {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-fg);
  }
  .ctx-level-toggle {
    display: inline-flex;
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .ctx-level-toggle button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    background: transparent;
    color: var(--color-fg);
    /* Transparent, not 0: forced colors repaints it, so the segment keeps a button shape. */
    border: 1px solid transparent;
    box-sizing: border-box;
    min-block-size: 28px;
    padding: 0 var(--space-3);
    font-family: inherit;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    cursor: pointer;
  }
  .ctx-level-toggle button + button {
    border-inline-start-color: var(--color-control-border);
  }
  /* The same selected look as Effort in Options: one segmented control everywhere. */
  .ctx-level-toggle button.active {
    background: var(--color-accent-bg-soft);
    color: var(--color-fg);
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }
  .ctx-level-toggle button:hover:not(.active) {
    background: var(--color-bg-hover);
  }
  .ctx-level-toggle button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  @media (forced-colors: active) {
    .ctx-level-toggle button.active {
      outline: 2px solid Highlight;
      outline-offset: -2px;
    }
  }
</style>
