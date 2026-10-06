<script lang="ts">
  import type { SettingsListItem } from './SettingsListView.types';

  interface Props {
    item: SettingsListItem;
    /** Command.Item's child-snippet props: option role, id, selection state and handlers. */
    optionProps: Record<string, unknown>;
  }

  const { item, optionProps }: Props = $props();

  function highlight(
    haystack: string,
    q: string | undefined,
  ): { pre: string; hit: string; post: string } {
    if (!q) return { pre: haystack, hit: '', post: '' };
    const lc = haystack.toLowerCase();
    const needle = q.trim().toLowerCase();
    if (!needle) return { pre: haystack, hit: '', post: '' };
    const i = lc.indexOf(needle);
    if (i < 0) return { pre: haystack, hit: '', post: '' };
    return {
      pre: haystack.slice(0, i),
      hit: haystack.slice(i, i + needle.length),
      post: haystack.slice(i + needle.length),
    };
  }

  const labelParts = $derived(highlight(item.label, item.highlightQuery));
  const descParts = $derived(highlight(item.description, item.highlightQuery));
</script>

{#snippet marked(parts: { pre: string; hit: string; post: string })}{parts.pre}{#if parts.hit}<mark
      >{parts.hit}</mark
    >{/if}{parts.post}{/snippet}

<div {...optionProps} class="slv-item" data-ega-settings-list-item={item.id}>
  {#if item.tabLabel}
    <span class="slv-tab-badge" data-tab={item.tab}>{item.tabLabel}</span>
  {/if}
  <span class="slv-body">
    <span class="slv-label">{@render marked(labelParts)}</span>
    <span class="slv-desc">{@render marked(descParts)}</span>
  </span>
  {#if item.modified}
    <span class="slv-modified-badge" data-ega-modified="true">Changed</span>
  {/if}
</div>

<style>
  .slv-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: start;
    gap: var(--space-3);
    width: 100%;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    color: var(--color-fg);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out);
  }
  /* One column width for every tab name, so the titles start on one line. */
  .slv-item:has(.slv-tab-badge) {
    grid-template-columns: 8rem 1fr auto;
  }
  .slv-item[data-selected] {
    background: var(--color-accent-bg-soft);
    border-color: var(--color-border-subtle);
    box-shadow: inset 2px 0 0 var(--color-accent);
  }
  .slv-tab-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    border: 1px solid var(--color-accent-border, var(--color-border));
    /* accent lands under 4.5:1 on the soft accent tint; accent-hover clears it in both themes. */
    color: var(--color-accent-hover);
    font-size: var(--fs-base);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    line-height: var(--lh-body);
    flex: 0 0 auto;
    justify-self: start;
    margin-top: 2px;
  }
  /* The selected row is already tinted; a second tint under the badge pulls its text under 4.5:1. */
  .slv-item[data-selected] .slv-tab-badge {
    background: transparent;
  }
  .slv-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .slv-label {
    font-weight: 600;
    color: var(--color-fg);
  }
  .slv-desc {
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .slv-modified-badge {
    color: var(--color-muted);
    font-size: var(--fs-base);
    flex: 0 0 auto;
  }
  /* --color-accent-bg-soft is too faint to spot in light theme; 30% still passes contrast. */
  mark {
    background: color-mix(in srgb, var(--color-accent) 30%, transparent);
    color: inherit;
    padding: 0;
    border-radius: 2px;
  }
</style>
