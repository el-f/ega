<script lang="ts">
  import type { ImportStatus } from '@/options/import-bundle';
  /** The one backup result banner. Both backup surfaces render it, so the role/live-region pair cannot drift. */
  interface Props {
    status: ImportStatus | null;
  }

  const { status }: Props = $props();
</script>

{#if status}
  <div
    class="backup-status {status.kind}"
    role={status.kind === 'err' ? 'alert' : 'status'}
    aria-live={status.kind === 'err' ? 'assertive' : 'polite'}
  >
    {status.msg}
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
