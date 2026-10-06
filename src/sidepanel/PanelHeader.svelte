<script lang="ts">
  import type { Settings } from '@/shared/types';
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import ActiveBackendChip from '@/shared/components/ActiveBackendChip.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
  import SquarePenIcon from '@lucide/svelte/icons/square-pen';
  import SearchIcon from '@lucide/svelte/icons/search';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import { conversationLabel } from '@/shared/saved-conversations';
  import HeaderMoreMenu from './HeaderMoreMenu.svelte';
  import ConversationsPopover from './ConversationsPopover.svelte';

  interface Props {
    settings: Settings | null;
    /** Id of the conversation on screen; the title names its site. */
    activeId: string;
    /** The site of the tab the panel follows; the list puts its conversations first. */
    tabSite: string;
    isEmptyThread: boolean;
    searchOpen: boolean;
    bookmarkFilter: boolean;
    onNewConversation: () => void;
    onToggleSearch: () => void;
    onOpenConversation: (id: string) => Promise<void>;
    /** Deletes after the Undo window; `onFail` runs when the worker could not delete it. */
    onDeleteConversation: (id: string, onFail: () => void) => Promise<{ undo: () => void }>;
    onCopyMarkdown: () => void;
    onDownloadJson: () => void;
    onShowShortcuts: () => void;
    onOpenSettings: () => void;
    onSetUpBackend: () => void;
    onReadyChange: (ready: boolean | null) => void;
    /** Set only while a request runs; it stops requests from every surface. */
    onCancelAll?: (() => void) | undefined;
  }

  let {
    settings,
    activeId,
    tabSite,
    isEmptyThread,
    searchOpen,
    bookmarkFilter = $bindable(),
    onNewConversation,
    onToggleSearch,
    onOpenConversation,
    onDeleteConversation,
    onCopyMarkdown,
    onDownloadJson,
    onShowShortcuts,
    onOpenSettings,
    onSetUpBackend,
    onReadyChange,
    onCancelAll,
  }: Props = $props();

  const site = $derived(conversationLabel(activeId));
  let titleEl: HTMLButtonElement | null = $state(null);
  let listOpen = $state(false);
</script>

<div class="sp-header">
  <h1 class="ega-sr-only">Ega</h1>
  <span class="sp-brand"><BrandMark size={16} label="" /></span>
  <button
    bind:this={titleEl}
    type="button"
    class="sp-site"
    aria-label={`${site}, conversations`}
    aria-haspopup="dialog"
    aria-expanded={listOpen}
    data-tooltip="Conversations"
    data-tooltip-placement="bottom"
    data-ega-header-site
    onclick={() => (listOpen = !listOpen)}
  >
    <span class="sp-site-name" data-ega-truncates>{site}</span>
    <span class="sp-site-chevron" class:open={listOpen}
      ><Icon icon={ChevronDownIcon} size={16} /></span
    >
  </button>
  {#if settings}
    <ActiveBackendChip {settings} onJump={onSetUpBackend} {onReadyChange} />
  {/if}
  <div class="sp-header-actions">
    {#if !isEmptyThread}
      <IconButton
        icon={SquarePenIcon}
        ariaLabel="New conversation"
        size="sm"
        dataAttrs={{ 'data-ega-new-conversation': 'true' }}
        onclick={onNewConversation}
      />
      <IconButton
        icon={SearchIcon}
        ariaLabel={searchOpen ? 'Close search' : 'Search this conversation'}
        size="sm"
        dataAttrs={{ 'data-ega-search-toggle': 'true', 'aria-pressed': String(searchOpen) }}
        onclick={onToggleSearch}
      />
    {/if}
    <HeaderMoreMenu
      {isEmptyThread}
      bind:bookmarkFilter
      {onCopyMarkdown}
      {onDownloadJson}
      {onShowShortcuts}
      {onOpenSettings}
      {onCancelAll}
    />
  </div>
</div>

<ConversationsPopover
  open={listOpen}
  anchor={titleEl}
  {activeId}
  {tabSite}
  onClose={() => (listOpen = false)}
  onOpen={async (id) => {
    listOpen = false;
    await onOpenConversation(id);
  }}
  onDelete={onDeleteConversation}
/>

<style>
  .sp-header {
    container: ega-header / inline-size;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 28px;
    inline-size: 100%;
    min-inline-size: 0;
  }
  .sp-brand {
    display: inline-flex;
    flex-shrink: 0;
  }
  /* The site title is the only header text that may end in an ellipsis; its name holds the full site. */
  .sp-site {
    flex: 1 1 auto;
    min-inline-size: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    block-size: 28px;
    padding: 0 var(--space-2);
    margin-inline-start: calc(-1 * var(--space-1));
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-ui);
    font-size: var(--fs-md);
    font-weight: 600;
    line-height: var(--lh-body);
    cursor: pointer;
    justify-content: flex-start;
  }
  .sp-site:hover,
  .sp-site[aria-expanded='true'] {
    background: var(--color-bg-hover);
  }
  .sp-site:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .sp-site-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sp-site-chevron {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-muted);
  }
  .sp-site-chevron.open {
    transform: rotate(180deg);
  }
  .sp-header-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }
  @media (forced-colors: active) {
    .sp-site {
      border-color: ButtonText;
    }
  }
</style>
