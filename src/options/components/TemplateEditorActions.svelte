<script lang="ts">
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    dirty: boolean;
    /** True when the template still differs from its default/inherited
     *  source — i.e. resetting would change something. */
    canReset: boolean;
    saveErr: string | null;
    saveOk: string | null;
    inheritedLabel: string;
    onSave: () => void | Promise<void>;
    onReset: () => void | Promise<void>;
  }

  const { dirty, canReset, saveErr, saveOk, inheritedLabel, onSave, onReset }: Props = $props();
</script>

<div class="action-row">
  <Button
    variant="primary"
    size="sm"
    disabled={!dirty}
    dataAttrs={{ 'data-ega-template-save': 'true' }}
    onclick={() => void onSave()}
  >
    Save
  </Button>
  <Button
    variant="secondary"
    size="sm"
    disabled={!canReset}
    dataAttrs={{ 'data-ega-template-reset': 'true' }}
    onclick={() => void onReset()}
  >
    {inheritedLabel}
  </Button>
</div>
{#if saveErr}<div class="err" role="alert">{saveErr}</div>{/if}
{#if saveOk}<div class="ok" role="status">{saveOk}</div>{/if}

<style>
  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .err {
    color: var(--color-danger);
    font-size: var(--fs-sm);
  }
  .ok {
    color: var(--color-success, var(--color-accent));
    font-size: var(--fs-sm);
  }
</style>
