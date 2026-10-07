<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import Popover from '@/shared/ui/Popover.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
  import CheckIcon from '@lucide/svelte/icons/check';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import {
    INDEX_KEY,
    conversationLabel,
    groupConversations,
    listConversations,
    pendingDeleteIds,
    type IndexEntry,
  } from '@/shared/saved-conversations';
  import { MAX_THREADS } from './state/conversation-store';
  import { conversationTitle, listTime } from './state/thread-view';
  import { debugCatch } from '@/shared/logger';

  interface Props {
    open: boolean;
    anchor: HTMLElement | null;
    activeId: string;
    tabSite: string;
    onClose: () => void;
    /** False: the conversation could not be read, and the row says so. */
    onOpen: (id: string) => Promise<boolean>;
    onDelete: (id: string, onFail: () => void) => Promise<{ undo: () => void }>;
  }

  const { open, anchor, activeId, tabSite, onClose, onOpen, onDelete }: Props = $props();

  /** Rows waiting out their Undo window, kept on screen in place of the row. */
  const undoing = new SvelteMap<
    string,
    { handle: Promise<{ undo: () => void }>; timer: ReturnType<typeof setTimeout> }
  >();
  /** Rows a failed delete brought back, each with its one-line reason. */
  const failed = new SvelteMap<string, string>();
  let entries = $state.raw<IndexEntry[] | null>(null);
  let listEl: HTMLElement | null = $state(null);
  let cvEl: HTMLElement | null = $state(null);
  let now = $state(Date.now());

  async function refresh(): Promise<void> {
    try {
      const rows = await listConversations();
      const pending = pendingDeleteIds();
      // A row this list deleted stays as its Undo line; one deleted elsewhere is already gone.
      entries = rows.filter((r) => !pending.has(r.origin) || undoing.has(r.origin));
      now = Date.now();
    } catch (e) {
      debugCatch(e, 'ConversationsPopover.refresh');
      entries = [];
    }
  }

  // The list follows the store while it is open: a save in this window or another one changes the rows.
  $effect(() => {
    if (!open) return;
    void refresh();
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      if (area === 'local' && INDEX_KEY in changes) void refresh();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  });

  const groups = $derived(entries === null ? null : groupConversations(entries, tabSite));
  const rowsInOrder = $derived(groups === null ? [] : [...groups.thisSite, ...groups.otherSites]);

  function rowTitle(e: IndexEntry): string {
    return conversationTitle(e);
  }

  function rowMeta(e: IndexEntry, otherSite: boolean): string {
    const when = listTime(Math.max(e.updatedAt, e.openedAt ?? 0), now);
    if (otherSite) return `${conversationLabel(e.origin)} · ${when}`;
    const n = e.messages;
    return n === undefined ? when : `${n} ${n === 1 ? 'message' : 'messages'} · ${when}`;
  }

  function focusRow(id: string | undefined, part: 'open' | 'delete' | 'undo' = 'open'): void {
    if (id === undefined) {
      cvEl?.closest<HTMLElement>('[role="dialog"]')?.focus();
      return;
    }
    const row = listEl?.querySelector(`[data-ega-conv-row="${CSS.escape(id)}"]`);
    const sel =
      part === 'open'
        ? '[data-ega-conv-open]'
        : part === 'delete'
          ? '[data-ega-conv-delete]'
          : '[data-ega-conv-undo]';
    row?.querySelector<HTMLElement>(sel)?.focus();
  }

  async function remove(id: string): Promise<void> {
    // A second click or Delete key while this one runs would schedule a delete its Undo cannot cancel.
    if (undoing.has(id)) return;
    failed.delete(id);
    const at = rowsInOrder.findIndex((r) => r.origin === id);
    // Held before any await: deleting the open conversation saves the index, and that refresh drops unheld rows.
    const handle = onDelete(id, () => {
      const u = undoing.get(id);
      if (u) clearTimeout(u.timer);
      undoing.delete(id);
      failed.set(id, "Couldn't delete. Try again.");
      void refresh();
    });
    const timer = setTimeout(() => {
      const hadFocus = listEl?.querySelector(
        `[data-ega-conv-row="${CSS.escape(id)}"] [data-ega-conv-undo]`,
      );
      const focused = hadFocus !== null && hadFocus === document.activeElement;
      undoing.delete(id);
      entries = (entries ?? []).filter((r) => r.origin !== id);
      if (focused) {
        const rest = rowsInOrder.filter((r) => !undoing.has(r.origin));
        void tick().then(() => focusRow((rest[at] ?? rest[at - 1])?.origin));
      }
    }, 8000);
    undoing.set(id, { handle, timer });
    await tick();
    focusRow(id, 'undo');
    try {
      await handle;
    } catch (e) {
      debugCatch(e, 'ConversationsPopover.remove');
      clearTimeout(timer);
      undoing.delete(id);
      failed.set(id, "Couldn't delete. Try again.");
    }
  }

  async function openRow(id: string): Promise<void> {
    failed.delete(id);
    let opened = false;
    try {
      opened = await onOpen(id);
    } catch (e) {
      debugCatch(e, 'ConversationsPopover.openRow');
    }
    if (!opened) failed.set(id, "Can't open this conversation.");
  }

  async function undo(id: string): Promise<void> {
    const u = undoing.get(id);
    if (u === undefined) return;
    clearTimeout(u.timer);
    undoing.delete(id);
    try {
      // An Undo during the switch away waits for the handle; a refresh meanwhile may have dropped the row.
      (await u.handle).undo();
      await refresh();
    } catch (e) {
      debugCatch(e, 'ConversationsPopover.undo');
    }
    await tick();
    focusRow(id);
  }

  /** Up/Down walk the rows' Open buttons; Right reaches the row's Delete, Left comes back; the Delete key deletes. */
  function onListKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-ega-conv-row]');
    const id = row?.dataset['egaConvRow'];
    if (id === undefined) return;
    const ids = rowsInOrder.map((r) => r.origin);
    const i = ids.indexOf(id);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next =
        ids[e.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)];
      e.preventDefault();
      focusRow(next, undoing.has(next ?? '') ? 'undo' : 'open');
    } else if (e.key === 'ArrowRight' && target.matches('[data-ega-conv-open]')) {
      e.preventDefault();
      focusRow(id, 'delete');
    } else if (e.key === 'ArrowLeft' && target.matches('[data-ega-conv-delete]')) {
      e.preventDefault();
      focusRow(id, 'open');
    } else if (e.key === 'Delete' && target.matches('[data-ega-conv-open]')) {
      e.preventDefault();
      void remove(id);
    } else return;
    // The panel's j/k and arrows would move the thread ring instead.
    e.stopPropagation();
  }
</script>

{#snippet row(e: IndexEntry, otherSite: boolean, first: boolean)}
  {@const current = e.origin === activeId}
  {@const title = rowTitle(e)}
  <li class="cv-row" data-ega-conv-row={e.origin}>
    {#if undoing.has(e.origin)}
      <div class="cv-undo" role="status">
        <span>Conversation deleted</span>
        <Button
          variant="ghost"
          size="sm"
          dataAttrs={{ 'data-ega-conv-undo': 'true', tabindex: 0 }}
          onclick={() => void undo(e.origin)}>Undo</Button
        >
      </div>
    {:else}
      <button
        type="button"
        class="cv-open"
        aria-current={current ? 'true' : undefined}
        aria-label={`${title}, ${rowMeta(e, otherSite)}${current ? ', open now' : ''}`}
        tabindex={first ? 0 : -1}
        data-ega-conv-open
        onclick={() => (current ? onClose() : void openRow(e.origin))}
      >
        <span class="cv-check" aria-hidden="true">
          {#if current}<Icon icon={CheckIcon} size={16} />{/if}
        </span>
        <span class="cv-text">
          <span class="cv-title" dir="auto" data-ega-conv-title data-ega-truncates>{title}</span>
          <span class="cv-meta">{rowMeta(e, otherSite)}</span>
        </span>
      </button>
      <IconButton
        icon={Trash2}
        ariaLabel={`Delete conversation: ${title}`}
        tooltip="Delete"
        size="sm"
        variant="danger"
        dataAttrs={{ 'data-ega-conv-delete': 'true', tabindex: -1 }}
        onclick={() => void remove(e.origin)}
      />
    {/if}
    {#if failed.has(e.origin)}
      <p class="cv-error" role="alert">{failed.get(e.origin)}</p>
    {/if}
  </li>
{/snippet}

{#if anchor}
  <Popover {open} {anchor} {onClose} placement="bottom-start" title="Conversations">
    <div class="cv" data-ega-conversations bind:this={cvEl}>
      {#if groups !== null}
        {#if rowsInOrder.length === 0}
          <p class="cv-empty">No other conversations yet</p>
        {:else}
          <!-- presentation: a box for the arrow-key handler; the buttons inside carry the roles. -->
          <div class="cv-lists" role="presentation" bind:this={listEl} onkeydown={onListKeydown}>
            {#if groups.thisSite.length > 0}
              <h2 class="cv-group" id="cv-this-site">This site</h2>
              <ul class="cv-list" aria-labelledby="cv-this-site">
                {#each groups.thisSite as e, i (e.origin)}
                  {@render row(e, false, i === 0)}
                {/each}
              </ul>
            {/if}
            {#if groups.otherSites.length > 0}
              <h2 class="cv-group" id="cv-other-sites">Other sites</h2>
              <ul class="cv-list" aria-labelledby="cv-other-sites">
                {#each groups.otherSites as e, i (e.origin)}
                  {@render row(e, true, groups.thisSite.length === 0 && i === 0)}
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
        <p class="cv-foot">Keeps your {MAX_THREADS} latest conversations</p>
      {/if}
    </div>
  </Popover>
{/if}

<style>
  /* The popover adds 8px of padding and a 1px border on each side, so its box is min(360px, 100vw - 24px):
     the panel's 12px gutter on both sides (spec §1.10). */
  .cv {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    inline-size: min(342px, calc(100vw - 42px));
    max-block-size: min(480px, calc(100vh - 64px));
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
  }
  .cv-lists {
    overflow-y: auto;
    min-block-size: 0;
  }
  /* No inline padding here, on the Undo row or on the footer: their text starts on the popover title's edge (R15). */
  .cv-group {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-muted);
  }
  .cv-group:first-child {
    margin-block-start: 0;
  }
  .cv-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .cv-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }
  .cv-open {
    flex: 1 1 0;
    min-inline-size: 0;
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    min-block-size: 48px;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-fg);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .cv-open:hover {
    background: var(--color-bg-hover);
  }
  .cv-open:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  /* Delete ends at the edge of .cv-lists, which scrolls and so clips a ring drawn outside the button. */
  .cv-row :global([data-ega-conv-delete]:focus-visible) {
    outline-offset: -2px;
  }
  .cv-check {
    display: inline-flex;
    flex-shrink: 0;
    inline-size: 16px;
    padding-block-start: var(--space-1);
    color: var(--color-accent);
  }
  .cv-text {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .cv-title {
    font-size: var(--fs-md);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cv-meta {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .cv-undo {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-block-size: 48px;
    padding-inline: 0 var(--space-1);
    color: var(--color-muted);
  }
  .cv-error {
    flex-basis: 100%;
    margin: 0;
    padding-inline-start: var(--space-5);
    color: var(--color-danger-fg);
    font-size: var(--fs-sm);
  }
  .cv-empty,
  .cv-foot {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
</style>
