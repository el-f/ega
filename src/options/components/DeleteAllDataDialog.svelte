<script lang="ts">
  /** The one confirm Delete all data keeps: typing DELETE is the safety, and the body offers a backup first. */
  import { onMount } from 'svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import { id as makeId } from '@/shared/uuid';

  interface Props {
    onConfirm: () => void;
    onCancel: () => void;
    /** Downloads a backup without closing the dialog. */
    onExport: () => Promise<void>;
  }

  const { onConfirm, onCancel, onExport }: Props = $props();

  const uid = makeId('ega-delete-all');
  let typed = $state('');
  let exported = $state(false);
  const ready = $derived(typed === 'DELETE');
  let field = $state<HTMLInputElement | null>(null);

  onMount(() => field?.focus());
</script>

<Dialog open title="Delete all data?" onClose={onCancel} size="sm">
  <div class="delete-all" data-ega-delete-all-dialog>
    <p>This removes everything Ega keeps in this browser:</p>
    <ul>
      <li>Settings and API keys</li>
      <li>Your languages, tasks, glossary and rules</li>
      <li>Side panel conversations</li>
      <li>The request list and saved answers</li>
    </ul>
    <p><strong>This cannot be undone.</strong></p>
    <div class="export-first">
      <Button
        variant="secondary"
        size="sm"
        iconKind="export"
        dataAttrs={{ 'data-ega-delete-all-export': true }}
        onclick={async () => {
          await onExport();
          exported = true;
        }}>Export all settings first</Button
      >
      <span class="note" role="status">{exported ? 'Exported to a file' : ''}</span>
    </div>
    <label class="label" for="{uid}-field" id="{uid}-label">Type DELETE to confirm</label>
    <input
      id="{uid}-field"
      class="field"
      type="text"
      dir="ltr"
      autocomplete="off"
      spellcheck="false"
      data-ega-delete-all-field
      bind:this={field}
      bind:value={typed}
      onkeydown={(e) => {
        if (e.key === 'Enter' && ready) onConfirm();
      }}
    />
  </div>
  {#snippet actions()}
    <Button variant="secondary" onclick={onCancel}>Keep my data</Button>
    <Button
      variant="danger"
      ariaDisabled={!ready}
      describedBy="{uid}-label"
      dataAttrs={{ 'data-ega-delete-all-confirm': true }}
      onclick={onConfirm}>Delete all data</Button
    >
  {/snippet}
</Dialog>

<style>
  .delete-all {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .delete-all p,
  .delete-all ul {
    margin: 0;
  }
  .delete-all ul {
    padding-inline-start: var(--space-5);
  }
  .export-first {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .note {
    color: var(--color-success-fg);
  }
  .label {
    margin: var(--space-2) 0 0;
    font-size: var(--fs-base);
  }
  .field {
    width: 100%;
    font-family: var(--font-mono);
  }
</style>
