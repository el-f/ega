<script lang="ts">
  import GitCompare from '@lucide/svelte/icons/git-compare';
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    count: number;
    /** When set, filters are active and the header shows "N matches" beside the count. */
    matchCount: number | null;
    hasEntries: boolean;
    /** First entry picked for a diff; shows the 'pick a second entry' pill. */
    compareTargetId?: string | null;
    /** Shows a count pill when > 0; clicking it clears all filters. */
    activeFilterCount?: number;
    onRefresh: () => void | Promise<void>;
    onExport: () => void | Promise<void>;
    onClear: () => void | Promise<void>;
    onCancelCompare?: () => void;
    /** Clicking the pair-pick pill scrolls the pinned row into view —
     *  serves the repeat-diff workflow where the anchor is far above. */
    onScrollToPinned?: () => void;
    onClearFilters?: () => void;
  }

  const {
    count,
    matchCount,
    hasEntries,
    compareTargetId = null,
    activeFilterCount = 0,
    onRefresh,
    onExport,
    onClear,
    onCancelCompare,
    onScrollToPinned,
    onClearFilters,
  }: Props = $props();
</script>

<header class="actions">
  <div class="meta">
    <button
      type="button"
      class="count count-refresh"
      data-tooltip="Refresh"
      data-tooltip-placement="bottom"
      data-ega-audit-refresh
      onclick={() => void onRefresh()}
    >
      {count}
      {count === 1 ? 'entry' : 'entries'}
    </button>
    {#if matchCount !== null}
      <span class="match-count" data-ega-audit-match-count
        >{matchCount}
        {matchCount === 1 ? 'match' : 'matches'}</span
      >
    {/if}
    {#if activeFilterCount > 0}
      <button
        type="button"
        class="filter-active-count"
        title="Clear all filters"
        aria-label="Clear {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}"
        data-ega-audit-filter-count
        disabled={!onClearFilters}
        onclick={() => onClearFilters?.()}
      >
        {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
      </button>
    {/if}
    {#if compareTargetId !== null}
      <span class="compare-prompt" role="status" data-ega-audit-compare-prompt>
        {#if onScrollToPinned}
          <button
            type="button"
            class="compare-prompt-target"
            aria-label="Scroll pinned entry into view"
            title="Scroll pinned entry into view"
            data-ega-audit-compare-scroll
            onclick={onScrollToPinned}
          >
            <GitCompare size={12} aria-hidden="true" />
            Pick a second entry to compare
          </button>
        {:else}
          <GitCompare size={12} aria-hidden="true" />
          Pick a second entry to compare
        {/if}
        {#if onCancelCompare}
          <button
            type="button"
            class="compare-cancel"
            data-ega-audit-compare-cancel
            onclick={onCancelCompare}
          >
            Cancel
          </button>
        {/if}
      </span>
    {/if}
  </div>
  <div class="primary-actions">
    <Button
      variant="secondary"
      size="sm"
      disabled={!hasEntries}
      dataAttrs={{ 'data-ega-audit-export': true }}
      onclick={() => void onExport()}
    >
      Export as JSON
    </Button>
    <Button
      variant="danger"
      size="sm"
      disabled={!hasEntries}
      dataAttrs={{ 'data-ega-audit-clear': true }}
      onclick={() => void onClear()}
    >
      Clear
    </Button>
  </div>
</header>

<style>
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .meta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .count {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
  }
  .count-refresh {
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .count-refresh:hover,
  .count-refresh:focus-visible {
    color: var(--color-fg);
    text-decoration: underline;
  }
  /* Hover and focus looked the same here; a keyboard user needs the ring every other button has. */
  .count-refresh:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .match-count {
    font-size: var(--fs-xs);
    color: var(--color-accent);
    font-weight: 600;
  }
  .filter-active-count {
    display: inline-flex;
    align-items: center;
    padding: 1px var(--space-2);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .filter-active-count:hover:not(:disabled),
  .filter-active-count:focus-visible:not(:disabled) {
    background: var(--color-accent);
    color: var(--color-accent-fg);
    outline: none;
  }
  .filter-active-count:disabled {
    cursor: default;
  }
  .compare-prompt {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-accent);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-weight: 600;
  }
  .compare-prompt-target {
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    font-size: var(--fs-xs);
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .compare-prompt-target:hover,
  .compare-prompt-target:focus-visible {
    outline: none;
    text-decoration: underline;
  }
  .compare-cancel {
    background: transparent;
    border: 0;
    padding: 0 var(--space-1);
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-decoration: underline;
  }
  .compare-cancel:hover,
  .compare-cancel:focus-visible {
    outline: none;
    text-decoration: none;
  }
  .primary-actions {
    display: inline-flex;
    gap: var(--space-2);
  }
</style>
