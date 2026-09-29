<script lang="ts" module>
  export interface CommandItem {
    id: string;
    label: string;
    /** Extra search keywords (e.g. slot description). */
    keywords?: readonly string[];
    /** Optional secondary text rendered after the label. */
    detail?: string;
    /** Items sharing a `group` render under one heading; ungrouped items go to the top. */
    group?: string;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Command, Popover } from 'bits-ui';

  interface Props {
    /** The button or chip that opens the popover. */
    trigger: Snippet;
    items: readonly CommandItem[];
    onSelect: (id: string) => void;
    /** Accessible name of the search field. */
    label: string;
    placeholder?: string;
    emptyText?: string;
    /** Optional footer snippet — e.g. "+ Define new variable" action. */
    footer?: Snippet<[{ close: () => void }]>;
    open?: boolean;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    /** False keeps the popover on the requested side even when it overflows the viewport. */
    avoidCollisions?: boolean;
    /** Hard cap on the picker width. Default 320. */
    maxWidth?: number;
    /** Hard cap on the list scroll height. Default 280. */
    maxListHeight?: number;
  }

  let {
    trigger,
    items,
    onSelect,
    label,
    placeholder = 'Search…',
    emptyText = 'No matches.',
    footer,
    open = $bindable(false),
    side = 'bottom',
    align = 'start',
    avoidCollisions = true,
    maxWidth = 320,
    maxListHeight = 280,
  }: Props = $props();

  function handlePick(id: string): void {
    onSelect(id);
    open = false;
  }

  function close(): void {
    open = false;
  }

  // Buckets are rebuilt whole and never observed mid-flow, so a plain object beats SvelteMap.
  const buckets = $derived.by(() => {
    const order: string[] = [];
    const map: Record<string, CommandItem[]> = Object.create(null);
    for (const it of items) {
      const key = it.group ?? '';
      const arr = map[key];
      if (arr) {
        arr.push(it);
      } else {
        order.push(key);
        map[key] = [it];
      }
    }
    return order.map((k) => ({ heading: k, items: map[k] ?? [] }));
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger class="ega-command-trigger">
    {@render trigger()}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      {side}
      {align}
      {avoidCollisions}
      sideOffset={12}
      class="ega-command-popover"
      style="max-width: {maxWidth}px; --ega-cmd-list-h: {maxListHeight}px;"
    >
      <Command.Root class="ega-command-root" {label} loop>
        <Command.Input class="ega-command-input" {placeholder} />
        <Command.List class="ega-command-list">
          <Command.Viewport>
            <Command.Empty class="ega-command-empty">{emptyText}</Command.Empty>
            {#each buckets as bucket (bucket.heading)}
              <Command.Group>
                <!-- Inside the items: Bits scrolls only the heading for an option that leads its parent. -->
                <Command.GroupItems>
                  {#if bucket.heading}
                    <Command.GroupHeading class="ega-command-group-heading" aria-hidden="true">
                      {bucket.heading}
                    </Command.GroupHeading>
                  {/if}
                  {#each bucket.items as it (it.id)}
                    <Command.Item
                      class="ega-command-item"
                      value={it.id}
                      keywords={it.keywords ? [...it.keywords] : []}
                      onSelect={() => handlePick(it.id)}
                    >
                      <span class="ega-command-item-label">{it.label}</span>
                      {#if it.detail}
                        <span class="ega-command-item-detail">{it.detail}</span>
                      {/if}
                    </Command.Item>
                  {/each}
                </Command.GroupItems>
              </Command.Group>
            {/each}
          </Command.Viewport>
        </Command.List>
        {#if footer}
          <div class="ega-command-footer">
            {@render footer({ close })}
          </div>
        {/if}
      </Command.Root>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.ega-command-trigger) {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    cursor: inherit;
    display: inline-flex;
    align-items: center;
  }
  :global(.ega-command-popover) {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    z-index: 99998;
    min-width: 220px;
    overflow: hidden;
  }
  :global(.ega-command-root) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  :global(.ega-command-input) {
    appearance: none;
    width: 100%;
    box-sizing: border-box;
    border: 0;
    border-bottom: 1px solid var(--color-border-subtle);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    outline: none;
  }
  :global(.ega-command-input::placeholder) {
    color: var(--color-muted);
  }
  :global(.ega-command-list) {
    max-height: var(--ega-cmd-list-h, 280px);
    overflow-y: auto;
    padding: var(--space-1);
  }
  :global(.ega-command-empty) {
    padding: var(--space-2) var(--space-3);
    font-size: var(--fs-sm);
    color: var(--color-muted);
    text-align: center;
  }
  :global(.ega-command-group-heading) {
    padding: var(--space-2) var(--space-2) var(--space-1);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }
  :global(.ega-command-item) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-fg);
    font-size: var(--fs-sm);
    outline: none;
  }
  :global(.ega-command-item[data-selected]) {
    background: var(--color-bg-hover);
  }
  :global(.ega-command-item-label) {
    flex: 1 1 auto;
    font-family: var(--font-mono);
  }
  :global(.ega-command-item-detail) {
    flex: 0 0 auto;
    color: var(--color-muted);
    font-size: var(--fs-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 50%;
  }
  :global(.ega-command-footer) {
    border-top: 1px solid var(--color-border-subtle);
    padding: var(--space-1);
  }
</style>
