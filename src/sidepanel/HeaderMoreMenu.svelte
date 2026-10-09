<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import Icon from '@/shared/ui/Icon.svelte';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import StarIcon from '@lucide/svelte/icons/star';
  import CircleStopIcon from '@lucide/svelte/icons/circle-stop';
  import CheckIcon from '@lucide/svelte/icons/check';
  import KeyboardIcon from '@lucide/svelte/icons/keyboard';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import { outsidePressFocus } from '@/shared/menu-focus';

  interface Props {
    isEmptyThread: boolean;
    bookmarkFilter: boolean;
    onCopyMarkdown: () => void;
    onDownloadJson: () => void;
    onShowShortcuts: () => void;
    onOpenSettings: () => void;
    /** Set only while a request is in flight; it stops requests from every surface, not just this panel. */
    onCancelAll?: (() => void) | undefined;
  }

  let {
    isEmptyThread,
    bookmarkFilter = $bindable(),
    onCopyMarkdown,
    onDownloadJson,
    onShowShortcuts,
    onOpenSettings,
    onCancelAll,
  }: Props = $props();
  const menuFocus = outsidePressFocus();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="ega-icon-btn variant-default size-sm"
    aria-label="More"
    data-tooltip="More"
    data-tooltip-placement="bottom"
    data-ega-header-more
  >
    <Icon icon={EllipsisIcon} size={16} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      {...menuFocus}
      preventScroll={false}
      collisionPadding={12}
      class="sp-menu"
      align="end"
      sideOffset={6}
    >
      <DropdownMenu.CheckboxItem
        class="sp-menu-item"
        bind:checked={bookmarkFilter}
        data-ega-bookmark-filter
      >
        {#snippet children({ checked })}
          <Icon icon={StarIcon} size={16} />
          <span class="sp-menu-label">Show bookmarked only</span>
          {#if checked}<Icon icon={CheckIcon} size={16} />{/if}
        {/snippet}
      </DropdownMenu.CheckboxItem>
      <DropdownMenu.Separator class="sp-menu-sep" />
      <!-- aria-disabled, not bits' disabled: the item stays in the arrow order so its note is read. -->
      <DropdownMenu.Item
        class="sp-menu-item"
        aria-disabled={isEmptyThread ? 'true' : undefined}
        aria-describedby={isEmptyThread ? 'sp-export-note' : undefined}
        closeOnSelect={!isEmptyThread}
        onSelect={() => {
          if (!isEmptyThread) onCopyMarkdown();
        }}
        data-ega-export-markdown
      >
        <Icon icon={CopyIcon} size={16} />
        <span class="sp-menu-label">Copy as Markdown</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="sp-menu-item"
        aria-disabled={isEmptyThread ? 'true' : undefined}
        aria-describedby={isEmptyThread ? 'sp-export-note' : undefined}
        closeOnSelect={!isEmptyThread}
        onSelect={() => {
          if (!isEmptyThread) onDownloadJson();
        }}
        data-ega-export-json
      >
        <Icon icon={DownloadIcon} size={16} />
        <span class="sp-menu-label">Download as JSON</span>
      </DropdownMenu.Item>
      {#if isEmptyThread}
        <p class="sp-menu-note" id="sp-export-note">Nothing to export yet</p>
      {/if}
      <DropdownMenu.Separator class="sp-menu-sep" />
      <DropdownMenu.Item class="sp-menu-item" onSelect={onShowShortcuts} data-ega-show-shortcuts>
        <Icon icon={KeyboardIcon} size={16} />
        <span class="sp-menu-label">Keyboard shortcuts</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item class="sp-menu-item" onSelect={onOpenSettings} data-ega-open-settings>
        <Icon icon={SettingsIcon} size={16} />
        <span class="sp-menu-label">Settings</span>
      </DropdownMenu.Item>
      <!-- Last, not first: a keyboard open lands on the first item, and a second Enter must not stop anything. -->
      {#if onCancelAll}
        <DropdownMenu.Separator class="sp-menu-sep" />
        <DropdownMenu.Item class="sp-menu-item" onSelect={onCancelAll} data-ega-cancel-all>
          <Icon icon={CircleStopIcon} size={16} />
          <span class="sp-menu-label">Stop all requests</span>
        </DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* :global — bits renders every panel menu in a portal on <body>; these are the one menu look the panel uses. */
  :global(.sp-menu) {
    box-sizing: border-box;
    min-inline-size: 220px;
    max-inline-size: calc(100vw - var(--space-4));
    /* No taller than the room on the side it opens to; a long menu scrolls inside itself (spec §1.7). */
    max-block-size: var(
      --bits-dropdown-menu-content-available-height,
      calc(100vh - var(--space-4))
    );
    overflow-y: auto;
    padding: var(--space-1);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    font-family: var(--font-ui);
    line-height: var(--lh-body);
    z-index: 99998;
  }
  :global(.sp-menu-item) {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 32px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-fg);
    font-size: var(--fs-sm);
    cursor: pointer;
    outline: none;
  }
  :global(.sp-menu-item[data-highlighted]) {
    background: var(--color-bg-hover);
  }
  /* The hover fill is about 1.2:1; a keyboard user needs the ring. Inset, so the menu's scroll box never clips it. */
  :global(.sp-menu-item:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  /* An open menu's button reads as pressed, the same on every panel menu (spec §2.4). */
  :global(.ega-icon-btn[aria-haspopup='menu'][aria-expanded='true']) {
    color: var(--color-accent-hover);
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
  }
  :global(.sp-menu-item[data-disabled]),
  :global(.sp-menu-item[aria-disabled='true']) {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  :global(.sp-menu-item.sp-menu-danger) {
    color: var(--color-danger-fg);
  }
  /* An item with no icon keeps the icon's place, so labels line up in a menu that mixes both. */
  :global(.sp-menu-icon-slot) {
    flex: 0 0 16px;
  }
  :global(.sp-menu-label) {
    flex: 1 1 auto;
    min-inline-size: 0;
  }
  :global(.sp-menu-heading) {
    padding: var(--space-1) var(--space-2) 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-muted);
  }
  :global(.sp-menu-heading.sp-menu-heading-indent) {
    padding-inline-start: calc(var(--space-2) * 2 + 16px);
  }
  :global(.sp-menu-note) {
    margin: 0;
    padding: 0 var(--space-2) var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  :global(.sp-menu-sep) {
    block-size: 1px;
    margin: var(--space-1) 0;
    background: var(--color-border-subtle);
  }
</style>
