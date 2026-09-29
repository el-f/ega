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
    <span class="slv-modified-badge" role="img" aria-label="Modified" title="Modified from default"
      >●</span
    >
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
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    flex: 0 0 auto;
    margin-top: 2px;
  }
  .slv-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .slv-label {
    font-weight: 500;
    color: var(--color-fg);
  }
  .slv-desc {
    font-size: var(--fs-sm);
    color: var(--color-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .slv-modified-badge {
    color: var(--color-accent);
    font-size: var(--fs-xs);
    margin-top: 4px;
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
