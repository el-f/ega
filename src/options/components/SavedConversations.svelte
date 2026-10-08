<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { onStoredChange } from '@/shared/stored-changes';
  import { relativeTime } from '@/shared/relative-time';
  import {
    INDEX_KEY,
    clearSavedConversations,
    conversationLabel,
    deleteSavedConversation,
    listSavedConversations,
    type IndexEntry,
  } from '@/shared/saved-conversations';

  /** The facts the side panel writes into each index row once a site can hold several conversations; a row saved before them has none. */
  type Row = IndexEntry & { title?: string; imageFirst?: true; messages?: number };

  let rows = $state.raw<Row[]>([]);
  let loaded = $state(false);
  // "Last used" reads relative to the last refresh; a save from a panel refreshes the list.
  let now = $state(Date.now());

  async function refresh(): Promise<void> {
    rows = await listSavedConversations();
    now = Date.now();
    loaded = true;
  }

  /** A conversation id is "<site>#<suffix>" once a site can hold several; an older id is the site itself. */
  function siteLabel(row: Row): string {
    return conversationLabel(row.origin.split('#')[0] ?? row.origin);
  }

  /** A row's name: its first message, "Image" when that was an image, else its site. */
  function rowTitle(row: Row): string | null {
    return row.title ?? (row.imageFirst ? 'Image' : null);
  }

  /** What leads the row's second line, before when it was last used: its site under a title, and its message count. */
  function rowLead(row: Row, site: string, titled: boolean): string {
    const count =
      row.messages === undefined
        ? null
        : `${row.messages} ${row.messages === 1 ? 'message' : 'messages'}`;
    return [titled ? site : null, count]
      .filter((part) => part !== null)
      .map((part) => `${part} · `)
      .join('');
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

  /** `key` names the delete: its error toast stays until closed (X14), and two deletes keep two toasts. */
  async function run(key: string, work: () => Promise<void>): Promise<void> {
    toastStore.close(key);
    try {
      await work();
    } catch (e) {
      toastStore.push({
        message: `Could not delete: ${(e as Error).message}`,
        variant: 'danger',
        key,
        action: { label: 'Try again', onClick: () => void run(key, work) },
      });
    }
    await refresh();
  }

  // The pressed button leaves with its row: the row that took its place takes focus (or the one above), else the card title.
  async function focusAfterDelete(at: number): Promise<void> {
    await tick();
    const card = document.querySelector('[data-ega-setting="advanced.savedConversations"]');
    const trash = card?.querySelectorAll<HTMLElement>('[data-ega-conv-delete]') ?? [];
    (trash[Math.min(at, trash.length - 1)] ?? card?.querySelector<HTMLElement>('h2'))?.focus();
  }

  async function deleteOne(row: Row): Promise<void> {
    const title = rowTitle(row);
    const site = siteLabel(row);
    const at = rows.indexOf(row);
    const ok = await confirmDialog({
      title: 'Delete this conversation?',
      body: `Delete the side panel conversation ${title === null ? `for ${site}` : `"${title}" on ${site}`}? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    await run(`conv-delete:${row.origin}`, () => deleteSavedConversation(row.origin));
    await focusAfterDelete(at);
  }

  async function clearAll(): Promise<void> {
    const n = rows.length;
    const ok = await confirmDialog({
      title: 'Delete all conversations?',
      body: `Delete all ${n} saved ${n === 1 ? 'conversation' : 'conversations'}? This cannot be undone.`,
      confirmLabel: 'Delete all',
      cancelLabel: 'Keep them',
    });
    if (!ok) return;
    await run('conv-delete-all', clearSavedConversations);
    await focusAfterDelete(0);
  }
</script>

<div data-ega-setting="advanced.savedConversations">
  <SectionCard
    title="Saved conversations"
    description="Side panel conversations kept on this computer"
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
          {@const site = siteLabel(row)}
          {@const title = rowTitle(row)}
          <li class="conv-row">
            <span class="conv-main">
              <!-- A long first message is cut to one line; the full text is in its title and the Delete name. -->
              <span class="conv-title" title={title ?? site} data-ega-conv-title data-ega-truncates
                >{title ?? site}</span
              >
              <span class="conv-meta"
                >{rowLead(row, site, title !== null)}<span aria-hidden="true"
                  >{relativeTime(row.updatedAt, now)}</span
                ><span class="ega-sr-only">{new Date(row.updatedAt).toLocaleString()}</span>
                · {sizeLabel(row.bytes)}</span
              >
            </span>
            <IconButton
              icon={Trash2}
              ariaLabel={title === null
                ? `Delete conversation for ${site}`
                : `Delete conversation "${title}" on ${site}`}
              tooltip="Delete"
              size="sm"
              dataAttrs={{ 'data-ega-conv-delete': true }}
              onclick={() => void deleteOne(row)}
            />
          </li>
        {/each}
      </ul>
    {:else if loaded}
      <EmptyState
        title="No saved conversations"
        description="Side panel conversations show here"
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
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 40px;
    padding-block: var(--space-1);
  }
  .conv-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .conv-row + .conv-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .conv-title {
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
