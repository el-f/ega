<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { onStoredChange } from '@/shared/stored-changes';
  import {
    INDEX_KEY,
    clearSavedConversations,
    conversationLabel,
    deleteSavedConversation,
    listSavedConversations,
    type IndexEntry,
  } from '@/shared/saved-conversations';

  let rows = $state.raw<IndexEntry[]>([]);
  let loaded = $state(false);

  async function refresh(): Promise<void> {
    rows = await listSavedConversations();
    loaded = true;
  }

  let stop: (() => void) | null = null;
  onMount(() => {
    void refresh();
    // A side panel saving while this page is open moves its row to the top.
    stop = onStoredChange((changes) => {
      if (INDEX_KEY in changes) void refresh();
    });
  });
  onDestroy(() => stop?.());

  function sizeLabel(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  async function run(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (e) {
      toastStore.push({
        message: `Could not delete: ${(e as Error).message}`,
        variant: 'danger',
        action: { label: 'Try again', onClick: () => void run(work) },
      });
    }
    await refresh();
  }

  async function deleteOne(row: IndexEntry): Promise<void> {
    const ok = await confirmDialog({
      title: 'Delete this conversation?',
      body: `Delete the side panel conversation for ${conversationLabel(row.origin)}? An open side panel empties too. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await run(() => deleteSavedConversation(row.origin));
  }

  async function clearAll(): Promise<void> {
    const n = rows.length;
    const ok = await confirmDialog({
      title: 'Delete all conversations?',
      body: `Delete all ${n} saved ${n === 1 ? 'conversation' : 'conversations'}? An open side panel empties too. This cannot be undone.`,
      confirmLabel: 'Delete all',
      cancelLabel: 'Keep them',
      danger: true,
    });
    if (ok) await run(clearSavedConversations);
  }
</script>

<div data-ega-setting="advanced.savedConversations">
  <SectionCard
    title="Saved conversations"
    description="Side panel conversations kept on this computer, one per site"
  >
    {#snippet headerActions()}
      {#if rows.length > 0}
        <Button
          variant="secondary"
          size="sm"
          dataAttrs={{ 'data-ega-conv-delete-all': true }}
          onclick={() => void clearAll()}>Delete all</Button
        >
      {/if}
    {/snippet}
    {#if rows.length > 0}
      <ul class="conv-list">
        {#each rows as row (row.origin)}
          {@const label = conversationLabel(row.origin)}
          <li class="conv-row">
            <span class="conv-site" title={label}>{label}</span>
            <span class="conv-meta">
              {new Date(row.updatedAt).toLocaleString()} · {sizeLabel(row.bytes)}
            </span>
            <IconButton
              icon={Trash2}
              ariaLabel="Delete conversation for {label}"
              tooltip="Delete"
              size="sm"
              onclick={() => void deleteOne(row)}
            />
          </li>
        {/each}
      </ul>
    {:else if loaded}
      <EmptyState
        title="No saved conversations"
        description="Side panel conversations show here, one per site"
        icon={PanelRight}
      />
    {/if}
  </SectionCard>
</div>

<style>
  .conv-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* Rows sit in the card, so a hairline sets them apart, not a box. */
  .conv-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 40px;
  }
  .conv-row + .conv-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .conv-site {
    font-size: var(--fs-base);
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conv-meta {
    font-size: var(--fs-base);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
