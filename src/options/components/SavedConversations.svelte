<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import EmptyState from '@/shared/components/EmptyState.svelte';
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
      });
    }
    await refresh();
  }

  async function deleteOne(row: IndexEntry): Promise<void> {
    const ok = await confirmDialog({
      title: 'Delete conversation',
      body: `Delete the side panel conversation for ${conversationLabel(row.origin)}? An open side panel empties too. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await run(() => deleteSavedConversation(row.origin));
  }

  async function clearAll(): Promise<void> {
    const n = rows.length;
    const ok = await confirmDialog({
      title: 'Clear all conversations',
      body: `Delete all ${n} saved ${n === 1 ? 'conversation' : 'conversations'}? An open side panel empties too. This cannot be undone.`,
      confirmLabel: 'Clear all',
      danger: true,
    });
    if (ok) await run(clearSavedConversations);
  }
</script>

{#if rows.length > 0}
  <ul class="conv-list" role="list">
    {#each rows as row (row.origin)}
      {@const label = conversationLabel(row.origin)}
      <li class="conv-row">
        <span class="conv-site" title={label}>{label}</span>
        <span class="conv-meta">
          {new Date(row.updatedAt).toLocaleString()} · {sizeLabel(row.bytes)}
        </span>
        <IconButton
          icon={Trash2}
          ariaLabel="Delete the conversation for {label}"
          tooltip="Delete"
          size="sm"
          variant="danger"
          onclick={() => void deleteOne(row)}
        />
      </li>
    {/each}
  </ul>
  <div class="conv-footer">
    <Button variant="danger" size="sm" onclick={() => void clearAll()}>
      Clear all conversations
    </Button>
  </div>
{:else if loaded}
  <EmptyState
    title="No saved conversations"
    description="Side panel conversations show here, one per site."
    icon={PanelRight}
  />
{/if}

<style>
  .conv-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .conv-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  .conv-site {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conv-meta {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .conv-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-2);
  }
</style>
