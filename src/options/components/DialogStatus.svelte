<script lang="ts">
  /** The dialog footer's status line: saving, saved, why not, or what a reset did with its Undo. */
  import type { SaveStatus } from './dialog-saver.svelte';

  interface Props {
    status: SaveStatus;
    /** Shown while nothing has been saved yet (a new task before it has a name). */
    idleText?: string;
  }

  const { status, idleText = '' }: Props = $props();

  const text = $derived(
    status.kind === 'saving'
      ? 'Saving...'
      : status.kind === 'saved'
        ? 'Saved'
        : status.kind === 'error' || status.kind === 'note'
          ? status.message
          : idleText,
  );
</script>

<span class="dialog-status" data-ega-dialog-status={status.kind}>
  <span role="status" aria-live="polite" class:error={status.kind === 'error'}>{text}</span>
  {#if status.kind === 'note' && status.undo}
    {@const undo = status.undo}
    <button type="button" class="undo" data-ega-dialog-undo onclick={() => undo()}>Undo</button>
  {/if}
</span>

<style>
  .dialog-status {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-height: 32px;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .error {
    color: var(--color-danger-fg);
  }
  .undo {
    min-height: 24px;
    padding: 0 var(--space-1);
    border: 0;
    background: transparent;
    color: var(--color-accent-hover);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .undo:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
</style>
