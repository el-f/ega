<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import Icon from '@/shared/ui/Icon.svelte';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import BookmarkIcon from '@lucide/svelte/icons/bookmark';
  import RepeatIcon from '@lucide/svelte/icons/repeat';
  import CircleStopIcon from '@lucide/svelte/icons/circle-stop';
  import CheckIcon from '@lucide/svelte/icons/check';
  import LaptopIcon from '@lucide/svelte/icons/laptop';
  import SunIcon from '@lucide/svelte/icons/sun';
  import MoonIcon from '@lucide/svelte/icons/moon';
  import type { ThemePref } from '@/shared/theme';

  interface Props {
    isEmptyThread: boolean;
    bookmarkFilter: boolean;
    theme: ThemePref;
    retryCount: number;
    /** The trigger, so the fallback popover can anchor to it once the menu closes. */
    trigger?: HTMLElement | null;
    onCopyMarkdown: () => void;
    onDownloadJson: () => void;
    onSetTheme: (to: ThemePref) => void;
    onOpenRetry: () => void;
    /** Set only while a request is in flight; it stops requests from every surface, not just this panel. */
    onCancelAll?: (() => void) | undefined;
  }

  let {
    isEmptyThread,
    bookmarkFilter = $bindable(),
    theme,
    retryCount,
    trigger = $bindable(null),
    onCopyMarkdown,
    onDownloadJson,
    onSetTheme,
    onOpenRetry,
    onCancelAll,
  }: Props = $props();

  const THEMES = [
    { value: 'system', label: 'System', icon: LaptopIcon },
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
  ] as const satisfies ReadonlyArray<{ value: ThemePref; label: string; icon: unknown }>;
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    bind:ref={trigger}
    class="ega-icon-btn variant-default size-sm"
    aria-label="More actions"
    data-ega-header-more
  >
    <Icon icon={EllipsisIcon} size={16} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sp-menu" align="end" sideOffset={6}>
      {#if onCancelAll}
        <DropdownMenu.Item class="sp-menu-item" onSelect={onCancelAll} data-ega-cancel-all>
          <Icon icon={CircleStopIcon} size={16} />
          <span class="sp-menu-label">Cancel all requests</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator class="sp-menu-sep" />
      {/if}
      <DropdownMenu.Item
        class="sp-menu-item"
        disabled={isEmptyThread}
        onSelect={onCopyMarkdown}
        data-ega-export-markdown
      >
        <Icon icon={CopyIcon} size={16} />
        <span class="sp-menu-label">Copy as Markdown</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="sp-menu-item"
        disabled={isEmptyThread}
        onSelect={onDownloadJson}
        data-ega-export-json
      >
        <Icon icon={DownloadIcon} size={16} />
        <span class="sp-menu-label">Download as JSON</span>
      </DropdownMenu.Item>
      <DropdownMenu.Separator class="sp-menu-sep" />
      <DropdownMenu.CheckboxItem
        class="sp-menu-item"
        bind:checked={bookmarkFilter}
        data-ega-bookmark-filter
      >
        {#snippet children({ checked })}
          <Icon icon={BookmarkIcon} size={16} />
          <span class="sp-menu-label">Show bookmarked only</span>
          {#if checked}<Icon icon={CheckIcon} size={16} />{/if}
        {/snippet}
      </DropdownMenu.CheckboxItem>
      <DropdownMenu.Separator class="sp-menu-sep" />
      <DropdownMenu.RadioGroup value={theme} onValueChange={(v) => onSetTheme(v as ThemePref)}>
        <DropdownMenu.GroupHeading class="sp-menu-heading">Theme</DropdownMenu.GroupHeading>
        {#each THEMES as t (t.value)}
          <DropdownMenu.RadioItem
            class="sp-menu-item"
            value={t.value}
            closeOnSelect={false}
            data-ega-theme={t.value}
          >
            {#snippet children({ checked })}
              <Icon icon={t.icon} size={16} />
              <span class="sp-menu-label">{t.label}</span>
              {#if checked}<Icon icon={CheckIcon} size={16} />{/if}
            {/snippet}
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
      <DropdownMenu.Separator class="sp-menu-sep" />
      <DropdownMenu.Item
        class="sp-menu-item"
        onSelect={onOpenRetry}
        aria-haspopup="dialog"
        data-ega-retry-budget-trigger
      >
        <Icon icon={RepeatIcon} size={16} />
        <span class="sp-menu-label">Fallback backends: {retryCount}…</span>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.sp-menu) {
    min-width: 220px;
    padding: var(--space-1);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    z-index: 99998;
  }
  :global(.sp-menu-item) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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
  :global(.sp-menu-item[data-disabled]) {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  :global(.sp-menu-label) {
    flex: 1 1 auto;
  }
  :global(.sp-menu-heading) {
    padding: var(--space-1) var(--space-2) 0;
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  :global(.sp-menu-sep) {
    height: 1px;
    margin: var(--space-1) 0;
    background: var(--color-border-subtle);
  }
</style>
