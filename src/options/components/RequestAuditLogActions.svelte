<script lang="ts">
  /** The line above the list: how many requests match the filters, and the compare pick in progress. */
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    /** Set while filters are on; the line shows "N matches" and a Clear filters button. */
    matchCount: number | null;
    /** First request picked for a compare; shows "Pick a second request to compare". */
    compareTargetId?: string | null;
    onClearFilters: () => void;
    onCancelCompare: () => void;
    /** Scrolls the picked request back into view when it is far above. */
    onScrollToPinned: () => void;
  }

  const {
    matchCount,
    compareTargetId = null,
    onClearFilters,
    onCancelCompare,
    onScrollToPinned,
  }: Props = $props();
</script>

{#if matchCount !== null || compareTargetId !== null}
  <div class="audit-status">
    {#if matchCount !== null}
      <span class="match-count" data-ega-audit-match-count
        >{matchCount}
        {matchCount === 1 ? 'match' : 'matches'}</span
      >
      <Button
        variant="ghost"
        size="sm"
        dataAttrs={{ 'data-ega-audit-clear-filters': true }}
        onclick={onClearFilters}>Clear filters</Button
      >
    {/if}
    {#if compareTargetId !== null}
      <span class="compare-prompt" data-ega-audit-compare-prompt>
        <span role="status">Pick a second request to compare</span>
        <Button
          variant="ghost"
          size="sm"
          dataAttrs={{ 'data-ega-audit-compare-scroll': true }}
          onclick={onScrollToPinned}>Show the first</Button
        >
        <Button
          variant="ghost"
          size="sm"
          dataAttrs={{ 'data-ega-audit-compare-cancel': true }}
          onclick={onCancelCompare}>Cancel</Button
        >
      </span>
    {/if}
  </div>
{/if}

<style>
  .audit-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
  }
  .match-count {
    font-size: var(--fs-base);
    color: var(--color-fg);
    font-variant-numeric: tabular-nums;
  }
  .compare-prompt {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    font-size: var(--fs-base);
  }
</style>
