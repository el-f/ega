<script lang="ts" module>
  export type SubTabId = 'diagnostics' | 'data' | 'labs';
  export const SUB_TABS: readonly { id: SubTabId; label: string }[] = [
    { id: 'diagnostics', label: 'Diagnostics' },
    { id: 'data', label: 'Data' },
    { id: 'labs', label: 'Labs' },
  ];
</script>

<script lang="ts">
  import { Tabs } from 'bits-ui';

  interface Props {
    active: SubTabId;
    /** Changed-settings count per sub-tab. Renders a "N changed" pill when > 0. */
    modifiedCounts?: Partial<Record<SubTabId, number>>;
    onSelect: (id: SubTabId) => void;
  }

  let { active, modifiedCounts, onSelect }: Props = $props();
</script>

<Tabs.Root
  value={active}
  onValueChange={(v) => onSelect(v as SubTabId)}
  loop
  activationMode="automatic"
  class="adv-sub-tabs-root"
>
  <Tabs.List class="adv-sub-tabs" aria-label="Advanced sub-section">
    {#each SUB_TABS as t (t.id)}
      {@const count = modifiedCounts?.[t.id] ?? 0}
      <Tabs.Trigger
        value={t.id}
        id={`adv-subtab-${t.id}`}
        class="adv-sub-tab"
        data-ega-subtab={t.id}
      >
        <span class="label">{t.label}</span>
        {#if count > 0}
          <span
            class="adv-sub-tab-count"
            data-ega-subtab-modified-count={t.id}
            title="{count} setting{count === 1 ? '' : 's'} changed from the default"
          >
            {count} changed
          </span>
        {/if}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
</Tabs.Root>

<style>
  :global(.adv-sub-tabs) {
    display: flex;
    flex-wrap: wrap;
    row-gap: 4px;
    gap: 2px;
    padding: 2px;
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  :global(.adv-sub-tab) {
    flex: 1 1 auto;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    color: var(--color-fg-subtle);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-size: var(--fs-sm);
    font-family: var(--font-ui);
    /* Weight is constant across states — bolding only the active tab re-measures
       the whole strip and slides the other tabs sideways. */
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  :global(.adv-sub-tab:hover[data-state='inactive']) {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
  }
  :global(.adv-sub-tab[data-state='active']) {
    background: var(--color-bg);
    color: var(--color-fg);
    border-color: var(--color-border);
    box-shadow: var(--shadow-sm);
  }
  :global(.adv-sub-tab:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  :global(.adv-sub-tab-count) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    padding: 0 6px;
    height: 16px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-weight: 500;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  /* Shares --motion-pulse with the deep-link target flash, so a click and a deep link read the same. */
  :global(.adv-sub-tab[data-ega-flash='true']) {
    animation: ega-subtab-flash var(--motion-pulse) var(--ease-out);
  }
  @keyframes ega-subtab-flash {
    0% {
      background: var(--color-accent-bg-soft);
    }
    100% {
      background: var(--color-bg);
    }
  }
  /* A static outline for reduced motion: it keeps the click feedback without the movement that triggers vestibular symptoms. */
  @media (prefers-reduced-motion: reduce) {
    :global(.adv-sub-tab[data-ega-flash='true']) {
      animation: ega-subtab-ring 200ms var(--ease-out);
    }
  }
  @keyframes ega-subtab-ring {
    0% {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    100% {
      outline: 2px solid transparent;
      outline-offset: 2px;
    }
  }
</style>
