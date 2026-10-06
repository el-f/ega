<script lang="ts">
  /** "Insert variable": a searchable list of the variables a prompt can use, each with its plain name and meaning. */
  import { Command, Popover } from 'bits-ui';
  import Check from '@lucide/svelte/icons/check';
  import Button from '@/shared/ui/Button.svelte';
  import type { PromptVariables } from './prompt-checks';
  import type { SlotSpec } from '@/shared/slot-registry';

  interface Props {
    variables: PromptVariables;
    /** Names the prompt already uses; they carry a check. */
    used: ReadonlySet<string>;
    /** Gets the token with its braces; the caller puts it at the caret and moves focus there. */
    onInsert: (token: string) => void;
  }

  const { variables, used, onInsert }: Props = $props();

  let open = $state(false);
  let button = $state<HTMLElement | null>(null);
  let list = $state<HTMLElement | null>(null);
  let moreBelow = $state(false);
  let pending: string | null = null;

  const name = (slot: SlotSpec, extra: string): string =>
    `${slot.label}, ${extra}, inserts {{${slot.name}}}${used.has(slot.name) ? ', used' : ''}`;

  function pick(slot: SlotSpec): void {
    pending = `{{${slot.name}}}`;
    open = false;
  }

  // Focus goes to the field the token went into, else back to the button (Esc, a click outside).
  function onCloseAutoFocus(e: Event): void {
    e.preventDefault();
    const token = pending;
    pending = null;
    if (token !== null) onInsert(token);
    else button?.focus();
  }

  function measure(): void {
    if (list === null) return;
    moreBelow = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
  }
  $effect(() => {
    if (list === null) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  });

  // role="application" would switch off browse mode around the list; keys reach it through the search field.
  function plainRoot(props: Record<string, unknown>): Record<string, unknown> {
    const { role: _role, tabindex: _tabindex, onkeydown: _onkeydown, ...rest } = props;
    return rest;
  }
  function listKeys(rootKeydown: unknown): (e: KeyboardEvent) => void {
    return (e) => {
      if (e.key === 'Home' || e.key === 'End') return;
      if (typeof rootKeydown === 'function') rootKeydown(e);
      // Bits never scrolls the first row into view, including when it reselects it.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        queueMicrotask(() =>
          list?.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' }),
        );
      }
    };
  }
</script>

<span class="vp-anchor" bind:this={button}>
  <Button
    variant="secondary"
    iconKind="add"
    dataAttrs={{
      'data-ega-slot-insert-picker': 'true',
      'aria-haspopup': 'listbox',
      'aria-expanded': open,
    }}
    onclick={() => (open = !open)}
  >
    Insert variable
  </Button>
</span>

<Popover.Root bind:open>
  <Popover.Portal>
    <Popover.Content
      customAnchor={button}
      side="bottom"
      align="end"
      sideOffset={8}
      class="vp-popover"
      data-ega-owns-escape
      data-ega-variable-picker
      {onCloseAutoFocus}
      onInteractOutside={(e) => {
        // The button toggles on its own click; closing here first would reopen it.
        if (button?.contains(e.target as Node)) e.preventDefault();
      }}
    >
      <Command.Root label="Insert variable" loop vimBindings={false}>
        {#snippet child({ props: rootProps })}
          <div {...plainRoot(rootProps)} class="vp-root">
            <Command.Input
              class="vp-search"
              placeholder="Search variables"
              aria-label="Search variables"
              onkeydown={listKeys(rootProps['onkeydown'])}
            />
            <div class="vp-list-wrap">
              <Command.List class="vp-list" bind:ref={list} onscroll={measure}>
                <Command.Viewport>
                  <Command.Empty class="vp-empty">No variable matches</Command.Empty>
                  <Command.Group>
                    <Command.GroupHeading class="vp-heading">Variables</Command.GroupHeading>
                    <Command.GroupItems>
                      {#each variables.filled as slot (slot.name)}
                        <Command.Item
                          class="vp-item"
                          value={slot.name}
                          keywords={[slot.label, slot.meaning]}
                          aria-label={name(slot, slot.meaning)}
                          data-ega-variable={slot.name}
                          onSelect={() => pick(slot)}
                        >
                          {@render row(slot, slot.meaning)}
                        </Command.Item>
                      {/each}
                    </Command.GroupItems>
                  </Command.Group>
                  {#if variables.empty.length > 0}
                    <Command.Group>
                      <Command.GroupHeading class="vp-heading">
                        Empty in this prompt
                      </Command.GroupHeading>
                      <Command.GroupItems>
                        {#each variables.empty as e (e.slot.name)}
                          <Command.Item
                            class="vp-item"
                            value={e.slot.name}
                            keywords={[e.slot.label, e.reason]}
                            disabled
                            aria-label={name(e.slot, e.reason)}
                            data-ega-variable={e.slot.name}
                          >
                            {@render row(e.slot, e.reason)}
                          </Command.Item>
                        {/each}
                      </Command.GroupItems>
                    </Command.Group>
                  {/if}
                </Command.Viewport>
              </Command.List>
              {#if moreBelow}<div class="vp-fade" aria-hidden="true"></div>{/if}
            </div>
          </div>
        {/snippet}
      </Command.Root>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

{#snippet row(slot: SlotSpec, second: string)}
  <span class="vp-line1" aria-hidden="true">
    <span class="vp-label">{slot.label}</span>
    <span class="vp-token">{`{{${slot.name}}}`}</span>
    {#if used.has(slot.name)}<span class="vp-used"><Check size={14} strokeWidth={2} /></span>{/if}
  </span>
  <span class="vp-line2" aria-hidden="true">{second}</span>
{/snippet}

<style>
  .vp-anchor {
    display: inline-flex;
  }
  :global(.vp-popover) {
    width: 360px;
    max-width: calc(100vw - var(--space-6));
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    /* Above Dialog content (99999): the picker opens inside the task dialog. */
    z-index: 100000;
    overflow: hidden;
  }
  .vp-root {
    display: flex;
    flex-direction: column;
  }
  :global(.vp-search) {
    appearance: none;
    width: 100%;
    box-sizing: border-box;
    border: 0;
    border-bottom: 1px solid var(--color-border-subtle);
    padding: var(--space-2) var(--space-3);
    min-height: 32px;
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    outline: none;
  }
  :global(.vp-search:focus-visible) {
    box-shadow: inset 0 -2px 0 var(--color-accent);
  }
  :global(.vp-search::placeholder) {
    color: var(--color-muted);
  }
  .vp-list-wrap {
    position: relative;
  }
  :global(.vp-list) {
    max-height: 360px;
    overflow-y: auto;
    padding: var(--space-1);
  }
  .vp-fade {
    position: absolute;
    inset: auto 0 0 0;
    height: var(--space-3);
    background: linear-gradient(to bottom, transparent, var(--color-bg-elevated));
    pointer-events: none;
  }
  :global(.vp-heading) {
    padding: var(--space-2) var(--space-2) var(--space-1);
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--color-muted);
  }
  :global(.vp-empty) {
    padding: var(--space-3);
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  :global(.vp-item) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-fg);
    outline: none;
  }
  :global(.vp-item[data-selected]) {
    background: var(--color-bg-hover);
    box-shadow: inset 2px 0 0 var(--color-accent);
  }
  :global(.vp-item[data-disabled]) {
    cursor: var(--cursor-disabled);
  }
  :global(.vp-item[data-disabled]) .vp-label {
    color: var(--color-muted);
  }
  .vp-line1 {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .vp-label {
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .vp-token {
    margin-inline-start: auto;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .vp-used {
    display: inline-flex;
    color: var(--color-success-fg);
  }
  .vp-line2 {
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
</style>
