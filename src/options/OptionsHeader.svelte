<script lang="ts">
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import ThemeToggle from '@/shared/components/ThemeToggle.svelte';
  import Kbd from '@/shared/ui/Kbd.svelte';
  import type { ThemePref } from '@/shared/theme';
  import Search from '@lucide/svelte/icons/search';

  interface Props {
    theme: ThemePref;
    onOpenSearch: () => void;
    onSetTheme: (next: ThemePref) => void;
  }

  import { isMacLike } from '@/shared/utils/platform';

  const { theme, onOpenSearch, onSetTheme }: Props = $props();

  const modLabel = isMacLike() ? '⌘' : 'Ctrl';
</script>

<div class="options-header">
  <h1 class="options-title">
    <BrandMark size={20} />
    <span>— Settings</span>
  </h1>
  <div class="header-actions">
    <button
      type="button"
      class="search-button"
      aria-label="Search settings"
      data-tooltip="Search settings ({modLabel}+,)"
      data-tooltip-placement="bottom"
      onclick={onOpenSearch}
    >
      <Search size={14} strokeWidth={1.75} />
      <span class="search-label">Search settings</span>
      <span class="search-kbd-group" aria-hidden="true"><Kbd>{modLabel}</Kbd>+<Kbd>,</Kbd></span>
    </button>
    <ThemeToggle {theme} {onSetTheme} />
  </div>
</div>

<style>
  .options-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    width: 100%;
  }
  .options-title {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    white-space: nowrap;
    font-size: var(--fs-md);
    font-weight: 600;
    line-height: var(--lh-heading);
  }
  .header-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .search-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: 1;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }
  .search-button:hover {
    color: var(--color-fg);
    border-color: var(--color-border-strong, var(--color-border));
  }
  .search-button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .search-kbd-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .search-label {
    white-space: nowrap;
  }
  @container options (max-width: 600px) {
    .search-label,
    .search-kbd-group {
      display: none;
    }
  }
</style>
