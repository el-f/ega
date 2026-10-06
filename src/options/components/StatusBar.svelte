<script lang="ts">
  /** The one page notice: no backend can run. One line, plus one action when the page has somewhere to send you. */
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    show: boolean;
    /** Absent on the Backends tab, where the backends themselves are the action. */
    onSetUp?: () => void;
  }

  const { show, onSetUp }: Props = $props();
</script>

<div class="status-bar-slot" data-ega-status-bar-slot data-empty={show ? undefined : 'true'}>
  {#if show}
    <div class="status-bar" role="status" data-ega-status-bar="needs-key">
      <span class="status-icon" aria-hidden="true">
        <AlertTriangle size={16} strokeWidth={1.75} />
      </span>
      <span class="status-body">No backend is set up yet, so Ega cannot translate</span>
      {#if onSetUp}
        <Button
          variant="secondary"
          onclick={onSetUp}
          dataAttrs={{ 'data-ega-status-jump-backends': true }}
        >
          Set up a backend
        </Button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .status-bar-slot {
    max-width: 640px;
    margin-inline: auto;
    margin-bottom: var(--space-5);
  }
  .status-bar-slot[data-empty='true'] {
    display: none;
  }
  .status-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-warning-border);
    border-radius: var(--radius-md);
    background: var(--color-warning-bg-deep);
    color: var(--color-warning-fg);
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .status-icon {
    display: inline-flex;
    flex: 0 0 auto;
  }
  .status-body {
    flex: 1 1 16rem;
  }
</style>
