<script lang="ts">
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import { id } from '@/shared/uuid';

  interface Props {
    open: boolean;
    title: string;
    body: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    /** When set, user must type this exact string to enable Confirm. */
    typeToConfirm?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    body,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    typeToConfirm,
    onConfirm,
    onCancel,
  }: Props = $props();

  let typed = $state('');
  const canConfirm = $derived(typeToConfirm ? typed === typeToConfirm : true);
  const bodyId = id('ega-confirm-body');
</script>

<!-- Focus starts on the safe button, or on the field a typed confirm needs (spec 5.5). -->
<Dialog
  {open}
  {title}
  onClose={onCancel}
  size="sm"
  describedBy={bodyId}
  initialFocus={typeToConfirm ? '.confirm-input' : '[data-ega-confirm-safe]'}
>
  {#snippet actions()}
    <Button variant="secondary" dataAttrs={{ 'data-ega-confirm-safe': true }} onclick={onCancel}
      >{cancelLabel}</Button
    >
    <Button variant={danger ? 'danger' : 'primary'} disabled={!canConfirm} onclick={onConfirm}>
      {confirmLabel}
    </Button>
  {/snippet}
  <p class="confirm-body" id={bodyId}>{body}</p>
  {#if typeToConfirm}
    <label class="confirm-label" for="confirm-input">
      Type <code>{typeToConfirm}</code> to confirm:
    </label>
    <input
      id="confirm-input"
      type="text"
      dir="auto"
      bind:value={typed}
      class="confirm-input"
      aria-label="Type to confirm"
    />
  {/if}
</Dialog>

<style>
  .confirm-body {
    margin: 0 0 var(--space-3);
    color: var(--color-fg);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
  }
  .confirm-label {
    display: block;
    font-size: var(--fs-sm);
    margin-bottom: var(--space-2);
    color: var(--color-muted);
  }
  .confirm-label code {
    padding: 0 var(--space-1);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg);
  }
  .confirm-input {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-family: var(--font-mono);
  }
</style>
