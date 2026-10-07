<script lang="ts">
  // Cmd/Ctrl+K command palette. Esc is handled by the Dialog primitive.
  import { Command } from 'bits-ui';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Kbd from '@/shared/ui/Kbd.svelte';
  import { rankMatches } from '../fuzzy-match';
  import type { Command as PaletteCommand, CommandGroup } from '../command-registry';

  interface Props {
    open: boolean;
    commands: readonly PaletteCommand[];
    onClose: () => void;
  }

  let { open, commands, onClose }: Props = $props();

  let query = $state('');

  // Group order is derived from the label keys so two literal arrays cannot drift.
  const GROUP_LABELS: Record<CommandGroup, string> = {
    actions: 'Actions',
    settings: 'Settings',
  };
  const GROUP_ORDER: readonly CommandGroup[] = Object.keys(GROUP_LABELS) as CommandGroup[];

  const filtered = $derived.by(() => {
    const q = query.trim();
    if (q === '') return commands.slice(0, 40);
    return rankMatches(q, commands, (c) => c.label + ' ' + (c.keywords?.join(' ') ?? '')).slice(
      0,
      40,
    );
  });

  type Section = { group: CommandGroup; items: readonly PaletteCommand[] };
  const grouped = $derived.by<Section[]>(() => {
    const out: Section[] = [];
    for (const g of GROUP_ORDER) {
      const items = filtered.filter((c) => c.group === g);
      if (items.length > 0) out.push({ group: g, items });
    }
    return out;
  });

  // The query is an editable combobox: Home/End and Cmd+Up/Down move its caret (APG), so they
  // must not bubble to Command.Root, which would take them for list navigation.
  function keepCaretKeys(e: KeyboardEvent): void {
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (e.key === 'Home' || e.key === 'End' || (e.metaKey && vertical)) e.stopPropagation();
  }

  function runCommand(cmd: PaletteCommand): void {
    void cmd.run();
    onClose();
  }
</script>

<Dialog {open} label="Command palette" {onClose} size="md" position="top">
  <!-- Ctrl+K opens the palette on both surfaces, so the vim bindings would fight it. -->
  <Command.Root label="Command palette" shouldFilter={false} loop vimBindings={false}>
    <Command.Input
      bind:value={query}
      class="ega-palette-input"
      placeholder="Type a command or search…"
      dir="auto"
      onkeydown={keepCaretKeys}
    />
    <Command.List class="ega-palette-list" aria-label="Command results">
      <Command.Viewport id="ega-cmd-list">
        {#each grouped as section (section.group)}
          <Command.Group>
            <!-- The heading leads the items: for an option that leads its parent, Bits scrolls only
                 the heading into view, so an ArrowDown into this group would hide the option. -->
            <Command.GroupItems>
              <Command.GroupHeading class="ega-palette-section-heading" aria-hidden="true">
                {GROUP_LABELS[section.group]}
              </Command.GroupHeading>
              {#each section.items as cmd (cmd.id)}
                <Command.Item
                  id={`ega-cmd-opt-${cmd.id}`}
                  class="ega-palette-item"
                  value={cmd.id}
                  onSelect={() => runCommand(cmd)}
                >
                  <span class="palette-label">{cmd.label}</span>
                  {#if cmd.hint}
                    <span class="palette-hint">{cmd.hint}</span>
                  {/if}
                </Command.Item>
              {/each}
            </Command.GroupItems>
          </Command.Group>
        {/each}
      </Command.Viewport>
    </Command.List>
    <Command.Empty class="ega-palette-empty" role="status" forceMount={grouped.length === 0}>
      No matches.
    </Command.Empty>
  </Command.Root>
  <p class="palette-foot" data-ega-palette-xref>
    Type <Kbd>shortcuts</Kbd> and press Enter to see the keyboard shortcuts.
  </p>
</Dialog>

<style>
  :global(.ega-palette-input) {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    transition:
      border-color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out);
  }
  :global(.ega-palette-input:focus) {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  :global(.ega-palette-list) {
    margin: var(--space-3) 0 0;
    max-height: 380px;
    overflow-y: auto;
  }
  :global(.ega-palette-section-heading) {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    padding: var(--space-2) var(--space-2) var(--space-1);
  }
  :global(.ega-palette-item) {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding: calc(var(--space-2) - 1px) calc(var(--space-3) - 1px);
    color: var(--color-fg);
    /* Transparent, not 0: forced colors repaints it, so the row keeps a button shape. */
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    cursor: pointer;
  }
  :global(.ega-palette-item[data-selected]) {
    background: var(--color-bg-hover);
  }
  .palette-label {
    flex: 1;
  }
  .palette-hint {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  :global(.ega-palette-empty) {
    margin: 1em 0;
    padding: var(--space-3);
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .palette-foot {
    margin: var(--space-2) 0 0;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
    color: var(--color-muted);
    font-size: var(--fs-xs);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
</style>
