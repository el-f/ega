<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
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
    EMPTY_THREAD_BYTES,
    conversationLabel,
    listConversations,
    scheduleConversationDelete,
    flushPendingDeletes,
    type IndexEntry,
  } from '@/shared/saved-conversations';

  /** The facts the side panel writes into each index row once a site can hold several conversations; a row saved before them has none. */
  type Row = IndexEntry & { title?: string; imageFirst?: true; messages?: number };

  let rows = $state.raw<Row[]>([]);
  let loaded = $state(false);
  const hidden = new SvelteSet<string>();
  const deleteToasts = new SvelteSet<string>();
  // "Last used" reads relative to the last refresh; a save from a panel refreshes the list.
  let now = $state(Date.now());

  async function refresh(): Promise<void> {
    rows = (await listConversations())
      .filter((row) => row.bytes > EMPTY_THREAD_BYTES && !hidden.has(row.origin))
      .sort((a, b) => b.updatedAt - a.updatedAt);
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
  function flushDeletes(): void {
    flushPendingDeletes();
    for (const key of [...deleteToasts]) toastStore.close(key);
    deleteToasts.clear();
  }
  onMount(() => {
    window.addEventListener('pagehide', flushDeletes);
    void refresh();
    // A side panel saving while this page is open moves its row to the top.
    stop = onStoredChange((changes) => {
      if (INDEX_KEY in changes) void refresh();
    });
  });
  onDestroy(() => {
    stop?.();
    window.removeEventListener('pagehide', flushDeletes);
    flushDeletes();
  });

  function sizeLabel(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /** The toast owns the Undo deadline, including its hover/focus pause. The worker commits after it closes. */
  function remove(ids: readonly string[], key: string, message: string, at: number): void {
    toastStore.close(key);
    for (const id of ids) hidden.add(id);
    rows = rows.filter((row) => !hidden.has(row.origin));
    const handle = scheduleConversationDelete(ids, {
      ms: null,
      onDone: () => {
        for (const id of ids) hidden.delete(id);
        void refresh();
      },
      onFail: () => {
        for (const id of ids) hidden.delete(id);
        toastStore.close(key);
        void refresh();
        toastStore.push({
          message: "Couldn't delete the conversation. Try again.",
          variant: 'danger',
          key,
          action: { label: 'Try again', onClick: () => remove(ids, key, message, at) },
        });
      },
    });
    deleteToasts.add(key);
    toastStore.push({
      message,
      variant: 'success',
      key,
      onClose: () => {
        deleteToasts.delete(key);
        handle.commit();
      },
      action: {
        label: 'Undo',
        onClick: () => {
          deleteToasts.delete(key);
          handle.undo();
          for (const id of ids) hidden.delete(id);
          void refresh().then(() =>
            focusAfterDelete(
              Math.max(
                0,
                rows.findIndex((row) => row.origin === ids[0]),
              ),
            ),
          );
        },
      },
    });
    void focusAfterDelete(at);
  }

  // The pressed button leaves with its row: the row that took its place takes focus (or the one above), else the card title.
  async function focusAfterDelete(at: number): Promise<void> {
    await tick();
    const card = document.querySelector('[data-ega-setting="advanced.savedConversations"]');
    const trash = card?.querySelectorAll<HTMLElement>('[data-ega-conv-delete]') ?? [];
    (trash[Math.min(at, trash.length - 1)] ?? card?.querySelector<HTMLElement>('h2'))?.focus();
  }

  function deleteOne(row: Row): void {
    const title = rowTitle(row);
    const site = siteLabel(row);
    remove(
      [row.origin],
      `conv-delete:${row.origin}`,
      `Deleted "${title ?? site}"`,
      rows.indexOf(row),
    );
  }

  function clearAll(): void {
    // Snapshot only the rows shown now; conversations arriving during Undo must survive.
    const ids = rows.map((row) => row.origin);
    remove(
      ids,
      `conv-delete-all:${ids.join('|')}`,
      `Deleted ${ids.length} ${ids.length === 1 ? 'conversation' : 'conversations'}`,
      0,
    );
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
