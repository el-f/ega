<script lang="ts">
  // Minimal / Rich only — `contextEnabled` owns the off state. The write is the same
  // `updateSettings` the Translate tab uses, so it is global, not per-session.

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
          {lvl.label}
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
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .ctx-level-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .ctx-level-label {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  /* Mirrors `.theme-toggle` in Options.svelte so the visual language is
     consistent across the two segmented radio groups in the extension. */
  .ctx-level-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .ctx-level-toggle button {
    background: transparent;
    color: var(--color-muted);
    /* Transparent, not 0: forced colors repaints it, so the segment keeps a button shape. */
    border: 1px solid transparent;
    box-sizing: border-box;
    min-height: 24px;
    padding: calc(var(--space-1) - 1px) calc(var(--space-2) - 1px);
    font-size: var(--fs-sm);
    line-height: 1;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  .ctx-level-toggle button.active {
    background: var(--color-accent-bg-soft);
    color: var(--color-fg);
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }
  .ctx-level-toggle button:hover:not(.active) {
    color: var(--color-fg);
  }
  .ctx-level-toggle button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .ctx-level-toggle button:active {
    transform: scale(0.97);
    transition: transform var(--motion-fast) var(--ease-out);
  }
</style>
