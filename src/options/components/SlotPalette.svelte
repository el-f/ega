<script lang="ts" module>
  import type { PromptTemplate } from '@/shared/types';

  export interface SlotPaletteProps {
    /** A built-in task or a custom task id: users only see chips that fill in for it. */
    task: string;
    /** Global scope spans every task — offer the whole registry, not one task's subset. */
    allTaskSlots?: boolean;
    /** Live draft template — used to detect custom `{{xyz}}` slots not in
     *  the registry, and to flag missing required slots. */
    template: PromptTemplate;
    /** Slot name → currently-resolved sample value. Parent computes from a
     *  `buildPrompt` preview pass. Empty values still render the chip. */
    resolvedValues: Record<string, string>;
    /** Click-to-insert. Token includes the braces — e.g. `{{text}}`. */
    onInsert: (slotToken: string) => void;
  }
</script>

<script lang="ts">
  import {
    slotsFor,
    allSlots,
    extractCustomSlots,
    requiredMissingSlots,
  } from '@/shared/slot-registry';
  import Button from '@/shared/ui/Button.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import Tooltip from '@/shared/ui/Tooltip.svelte';
  import CommandPicker, { type CommandItem } from '@/shared/ui/CommandPicker.svelte';

  const {
    task,
    allTaskSlots = false,
    template,
    resolvedValues,
    onInsert,
  }: SlotPaletteProps = $props();

  const builtInSlots = $derived(allTaskSlots ? allSlots() : slotsFor(task));
  const customDetected = $derived(extractCustomSlots(template));

  const requiredMissing = $derived(requiredMissingSlots(task, template.user));

  let insertPickerOpen = $state(false);

  function previewValue(name: string): string {
    const v = resolvedValues[name];
    if (typeof v !== 'string' || v.length === 0) return '';
    return v.length > 240 ? `${v.slice(0, 237)}…` : v;
  }

  function sourceName(source: string): string {
    if (source === 'request') return 'request';
    if (source === 'preset') return 'preset';
    if (source === 'context') return 'context';
    if (source === 'instruction') return 'instruction';
    return 'custom';
  }

  function tooltipFor(name: string, description?: string, source?: string): string {
    const preview = previewValue(name);
    const base = description ? description : 'unknown variable — it will be empty';
    // Name the source so the icon glyph isn't the only carrier of it.
    const desc = source ? `${base}\nSource: ${sourceName(source)}` : base;
    return preview ? `${desc}\n\nCurrent value: ${preview}` : desc;
  }

  function iconFor(source: string): string {
    if (source === 'request') return '◆';
    if (source === 'preset') return '◇';
    if (source === 'context') return '▤';
    if (source === 'instruction') return '✎';
    return '·';
  }

  // Includes registry slots the current task does not list, so a partly-filled slot can still be inserted.
  const pickerItems = $derived.by((): readonly CommandItem[] => {
    const items: CommandItem[] = [];
    for (const s of builtInSlots) {
      items.push({
        id: s.name,
        label: s.name,
        keywords: s.description ? [s.description] : [],
        detail: previewValue(s.name) || s.description,
        group: 'Variables',
      });
    }
    for (const name of customDetected) {
      items.push({
        id: name,
        label: name,
        detail: 'unknown — it will be empty',
        group: 'Unknown',
      });
    }
    return items;
  });

  function handlePicked(id: string): void {
    onInsert(`{{${id}}}`);
  }
</script>

<div class="slot-palette" data-ega-slot-palette>
  <div class="palette-header-row">
    <div class="palette-heading">Variables</div>
    <CommandPicker
      bind:open={insertPickerOpen}
      items={pickerItems}
      onSelect={handlePicked}
      label="Insert variable"
      placeholder="Search variables…"
      emptyText="No matching variable."
      side="top"
      align="end"
      avoidCollisions={false}
      maxWidth={240}
      maxListHeight={180}
    >
      {#snippet trigger()}
        <Button
          variant="secondary"
          size="sm"
          iconKind="add"
          dataAttrs={{ 'data-ega-slot-insert-picker': 'true' }}
        >
          Insert variable
        </Button>
      {/snippet}
    </CommandPicker>
  </div>

  <div class="chip-row" data-ega-slot-row="builtin">
    {#each builtInSlots as slot (slot.name)}
      {@const missing = requiredMissing.includes(slot.name)}
      <Tooltip text={tooltipFor(slot.name, slot.description, slot.source)}>
        {#snippet trigger()}
          <span class="chip-wrap builtin">
            <Button
              variant="ghost"
              size="sm"
              extraClass={missing ? 'required-missing' : ''}
              dataAttrs={{ 'data-ega-slot-chip': slot.name }}
              onclick={() => onInsert(`{{${slot.name}}}`)}
            >
              <span class="chip-icon" aria-hidden="true">{iconFor(slot.source)}</span>
              <span class="ega-sr-only">{sourceName(slot.source)} variable:</span>
              <span class="chip-name">{slot.name}</span>
              {#if slot.required && missing}
                <Badge variant="danger">required</Badge>
              {/if}
            </Button>
          </span>
        {/snippet}
      </Tooltip>
    {/each}
  </div>

  {#if customDetected.length > 0}
    <div class="chip-row" data-ega-slot-row="custom">
      {#each customDetected as name (name)}
        <span class="custom-chip-group">
          <Tooltip text={tooltipFor(name)}>
            {#snippet trigger()}
              <span class="chip-wrap custom">
                <Button
                  variant="ghost"
                  size="sm"
                  dataAttrs={{ 'data-ega-slot-chip': name }}
                  onclick={() => onInsert(`{{${name}}}`)}
                >
                  <span class="chip-icon" aria-hidden="true">·</span>
                  <span class="ega-sr-only">unknown variable:</span>
                  <span class="chip-name">{name}</span>
                </Button>
              </span>
            {/snippet}
          </Tooltip>
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .slot-palette {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  .palette-heading {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  /* Restyles the inner Button as a chip; the primitive still owns sizing, focus ring and disabled tokens. */
  .chip-wrap :global(.ega-btn) {
    font-family: var(--font-mono);
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    padding: 2px var(--space-2);
    gap: var(--space-1);
  }
  .chip-wrap :global(.ega-btn:not(:disabled):hover) {
    background: var(--color-accent-bg-hover);
  }
  .chip-wrap.custom :global(.ega-btn) {
    background: var(--color-bg-elevated);
    color: var(--color-fg-subtle);
  }
  .chip-wrap :global(.ega-btn.required-missing) {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
  .chip-icon {
    opacity: 0.6;
  }
  .chip-name {
    font-weight: 500;
  }
  .custom-chip-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .palette-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
</style>
