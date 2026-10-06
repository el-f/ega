<script lang="ts" module>
  import type { Component } from 'svelte';

  export interface NavItem<Id extends string = string> {
    id: Id;
    label: string;
    icon: Component<{
      size?: number | string;
      strokeWidth?: number | string;
      class?: string;
    }>;
    group?: string;
  }

  export interface NavGroup {
    id: string;
    label: string;
  }
</script>

<script lang="ts">
  interface Props {
    items: readonly NavItem[];
    /** Items whose `group` is missing or unknown render first, under no heading. */
    groups?: readonly NavGroup[];
    active: string;
    /** `source` is 'keyboard' for rail arrow/Home/End activation, 'pointer' otherwise. */
    onSelect: (id: string, source?: 'pointer' | 'keyboard') => void;
  }

  let { items, groups, active, onSelect }: Props = $props();

  function handleKey(e: KeyboardEvent, currentId: string): void {
    const flat = items.map((i) => i.id);
    const idx = flat.indexOf(currentId);
    if (idx === -1) return;
    let next: number;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % flat.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
      next = (idx - 1 + flat.length) % flat.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = flat.length - 1;
    else return;
    e.preventDefault();
    const target = flat[next];
    if (target) {
      onSelect(target, 'keyboard');
      // Focus after the render flush, once the new tab owns `tabindex=0`.
      queueMicrotask(() => {
        const el = document.querySelector<HTMLButtonElement>(`#tab-${target}`);
        el?.focus();
      });
    }
  }

  const buckets = $derived.by(() => {
    if (!groups || groups.length === 0) {
      return [{ group: null as NavGroup | null, items: [...items] }];
    }
    const known = new Set(groups.map((g) => g.id));
    const ungrouped = items.filter((i) => !i.group || !known.has(i.group));
    const grouped = groups.map((g) => ({
      group: g,
      items: items.filter((i) => i.group === g.id),
    }));
    const out: { group: NavGroup | null; items: NavItem[] }[] = [];
    if (ungrouped.length > 0) out.push({ group: null, items: ungrouped });
    for (const g of grouped) if (g.items.length > 0) out.push(g);
    return out;
  });
</script>

<nav class="options-nav" aria-label="Settings sections">
  <!-- One tablist per group: a heading inside role="tablist" fails aria-required-children. -->
  <div class="options-nav-list">
    {#each buckets as bucket (bucket.group?.id ?? '__ungrouped__')}
      {#if bucket.group}
        <h2 class="options-nav-group-label" id={`options-nav-group-${bucket.group.id}`}>
          {bucket.group.label}
        </h2>
      {/if}
      <div
        class="options-nav-tablist"
        role="tablist"
        aria-orientation="vertical"
        {...bucket.group ? { 'aria-labelledby': `options-nav-group-${bucket.group.id}` } : {}}
      >
        {#each bucket.items as item (item.id)}
          {@const Icon = item.icon}
          {@const isActive = item.id === active}
          <button
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={isActive}
            aria-label={item.label}
            tabindex={isActive ? 0 : -1}
            class="options-nav-item"
            class:active={isActive}
            data-tooltip={item.label}
            onclick={() => onSelect(item.id, 'pointer')}
            onkeydown={(e) => handleKey(e, item.id)}
          >
            <span class="options-nav-icon" aria-hidden="true">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span class="options-nav-label">{item.label}</span>
          </button>
        {/each}
      </div>
    {/each}
  </div>
</nav>

<style>
  .options-nav {
    width: 100%;
  }
  .options-nav-list {
    margin: 0;
    padding: var(--space-3) var(--space-2) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  .options-nav-tablist {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: var(--space-3);
  }
  .options-nav-tablist:last-child {
    padding-bottom: 0;
  }
  .options-nav-group-label {
    margin: var(--space-4) 0 var(--space-1);
    padding: 0 var(--space-2);
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    line-height: 1.4;
  }
  .options-nav-group-label:first-child {
    margin-top: 0;
  }
  .options-nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    color: var(--color-muted);
    border: 0;
    border-radius: var(--radius-sm);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    line-height: 1.4;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  .options-nav-item::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
    background: var(--color-accent);
    opacity: 0;
    transition: opacity var(--motion-fast) var(--ease-out);
  }
  .options-nav-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    color: currentColor;
    line-height: 0;
  }
  .options-nav-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* Pads the line box so descenders clear the overflow:hidden clip. */
    padding-block: 1px;
  }
  .options-nav-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .options-nav-item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .options-nav-item.active {
    background: var(--color-bg-hover);
    color: var(--color-fg);
    font-weight: 500;
  }
  .options-nav-item.active::before {
    opacity: 1;
  }

  /* Labels are visible at this width, so the global data-tooltip rule would only duplicate them over the row above. */
  @container options (width > 880px) {
    .options-nav .options-nav-item[data-tooltip]:hover::after,
    .options-nav .options-nav-item[data-tooltip]:focus-visible::after {
      content: none;
    }
  }

  /* Options.svelte sets `container-type: inline-size`, so this tracks the nav's own width. */
  @container options (max-width: 880px) {
    .options-nav-list {
      padding: 4px;
      gap: 4px;
      align-items: center;
      width: 48px;
    }
    .options-nav-tablist {
      width: 100%;
      align-items: center;
    }
    .options-nav-group-label {
      display: none;
    }
    .options-nav-item {
      justify-content: center;
      padding: 0;
      width: 36px;
      height: 36px;
    }
    .options-nav-item::before {
      left: 0;
      top: 4px;
      bottom: 4px;
      width: 2px;
    }
    .options-nav-label {
      display: none;
    }
    /* Tooltip sits right of the button — above or below would clip the icons next to it. */
    .options-nav-item[data-tooltip]:hover::after,
    .options-nav-item[data-tooltip]:focus-visible::after {
      content: attr(data-tooltip);
      position: absolute;
      left: calc(100% + 8px);
      top: 50%;
      transform: translateY(-50%);
      background: var(--color-bg-elevated, var(--color-bg-sunken));
      color: var(--color-fg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 2px var(--space-2);
      font-size: var(--fs-xs);
      font-family: var(--font-ui);
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 1px 3px var(--color-shadow);
      z-index: 10;
    }
  }
</style>
