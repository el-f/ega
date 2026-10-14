<script lang="ts">
  import type { ImportStatus } from '@/options/import-bundle';
  import Button from '@/shared/ui/Button.svelte';
  /** The one backup result banner. Both backup surfaces render it, so the role/live-region pair cannot drift. */
  interface Props {
    status: ImportStatus | null;
  }

  const { status }: Props = $props();
  let undoing = $state(false);
  let undone = $state.raw<ImportStatus | null>(null);
  let error = $state('');
  async function undo(current: ImportStatus): Promise<void> {
    if (undoing || !current.undo) return;
    undoing = true;
    error = '';
    try {
      await current.undo();
      undone = current;
    } catch {
      error = 'Ega could not undo the import. Try again.';
    } finally {
      undoing = false;
    }
  }
</script>

{#if status}
  <div
    class="backup-status {status.kind}"
    role={status.kind === 'err' ? 'alert' : 'status'}
    aria-live={status.kind === 'err' ? 'assertive' : 'polite'}
  >
    {undone === status ? 'Undid the task import.' : status.msg}
    {#if status.undo && undone !== status}<Button
        variant="ghost"
        size="sm"
        disabled={undoing}
        onclick={() => void undo(status)}>Undo</Button
      >{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </div>
{/if}

<style>
  .backup-status {
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    border-left: 3px solid currentColor;
    background: var(--color-bg-elevated);
    font-size: var(--fs-sm);
  }
  .backup-status.ok {
    color: var(--color-success-fg);
    border-left-color: var(--color-success);
  }
  .backup-status.err {
    color: var(--color-danger-fg);
    border-left-color: var(--color-danger);
  }
</style>
