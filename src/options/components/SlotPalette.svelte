<script lang="ts" module>
  import type { Task } from '@/shared/task-prompts';
  import type { PromptTemplate } from '@/shared/types';

  export interface SlotPaletteProps {
    /** Drives `slotsForTask` so users only see chips that actually fill in
     *  for the current task. */
    task: Task;
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
    /** Custom slots that already have a description saved by the user. */
    customSlots: readonly string[];
    /** Persists a custom-slot definition. Parent decides where it lives. */
    onDefineCustom?: ((name: string, description: string) => void | Promise<void>) | undefined;
  }
</script>

<script lang="ts">
  import {
    slotsForTask,
    allSlots,
    extractCustomSlots,
    requiredMissingSlots,
    SLOT_REGISTRY,
  } from '@/shared/slot-registry';
  import { SLOT_DESCRIPTION_MAX, SLOT_NAME_MAX } from '@/shared/settings-schema';
  import Button from '@/shared/ui/Button.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Tooltip from '@/shared/ui/Tooltip.svelte';
  import CommandPicker, { type CommandItem } from '@/shared/ui/CommandPicker.svelte';

  const {
    task,
    allTaskSlots = false,
    template,
    resolvedValues,
    onInsert,
    customSlots,
    onDefineCustom,
  }: SlotPaletteProps = $props();

  const builtInSlots = $derived(allTaskSlots ? allSlots() : slotsForTask(task));
  const customDetected = $derived(extractCustomSlots(template));

  const requiredMissing = $derived(requiredMissingSlots(task, template.user));

  let defineOpen = $state(false);
  let defineName = $state('');
  let defineDesc = $state('');
  let defineErr: string | null = $state(null);

  let insertPickerOpen = $state(false);

  function openDefineFor(name: string): void {
    defineOpen = true;
    defineName = name;
    defineDesc = '';
    defineErr = null;
  }

  function openDefineNew(): void {
    defineOpen = true;
    defineName = '';
    defineDesc = '';
    defineErr = null;
  }

  function closeDefine(): void {
    defineOpen = false;
    defineErr = null;
  }

  async function submitDefine(): Promise<void> {
    const name = defineName.trim();
    if (!/^\w+$/.test(name)) {
      defineErr = 'Use only letters, digits and underscores.';
      return;
    }
    if (name.length > SLOT_NAME_MAX) {
      defineErr = `Name is too long (max ${SLOT_NAME_MAX} characters).`;
      return;
    }
    if (Object.hasOwn(SLOT_REGISTRY, name)) {
      defineErr = `${name} is a built-in variable`;
      return;
    }
    const description = defineDesc.trim();
    if (description.length > SLOT_DESCRIPTION_MAX) {
      defineErr = `Description is too long (max ${SLOT_DESCRIPTION_MAX} characters).`;
      return;
    }
    await onDefineCustom?.(name, description);
    defineOpen = false;
    onInsert(`{{${name}}}`);
  }

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
    const base = description ? description : 'custom variable';
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
        detail: previewValue(name) || 'custom variable',
        group: 'Custom',
      });
    }
    for (const name of customSlots) {
      if (customDetected.includes(name)) continue;
      items.push({
        id: name,
        label: name,
        detail: 'custom variable',
        group: 'Custom',
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
      emptyText="No matching variable. Use + Custom variable to define one."
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
      {#snippet footer({ close })}
        {#if onDefineCustom}
          <Button
            variant="ghost"
            size="sm"
            dataAttrs={{ 'data-ega-slot-add-custom': 'true' }}
            onclick={() => {
              close();
              openDefineNew();
            }}
          >
            + Custom variable
          </Button>
        {/if}
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

  {#if customDetected.length > 0 || customSlots.length > 0}
    <div class="chip-row" data-ega-slot-row="custom">
      {#each customDetected as name (name)}
        {@const defined = customSlots.includes(name)}
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
                  <span class="ega-sr-only">custom variable:</span>
                  <span class="chip-name">{name}</span>
                </Button>
              </span>
            {/snippet}
          </Tooltip>
          {#if !defined && onDefineCustom}
            <Button
              variant="ghost"
              size="sm"
              dataAttrs={{ 'data-ega-slot-define': name }}
              onclick={() => openDefineFor(name)}
            >
              + Define
            </Button>
          {/if}
        </span>
      {/each}
    </div>
  {/if}
</div>

{#if defineOpen}
  <Dialog open={true} title="Define custom variable" onClose={closeDefine} size="sm">
    {#snippet actions()}
      <Button variant="secondary" onclick={closeDefine}>Cancel</Button>
      <Button variant="primary" onclick={() => void submitDefine()}>Define</Button>
    {/snippet}
    <div class="dialog-body">
      <Input
        label="Name"
        bind:value={defineName}
        placeholder="myVariable"
        maxlength={SLOT_NAME_MAX}
        dataAttrs={{ 'data-ega-slot-define-name': 'true' }}
      />
      <Input
        label="Description"
        bind:value={defineDesc}
        placeholder="A note for you. The model never sees it."
        maxlength={SLOT_DESCRIPTION_MAX}
        dataAttrs={{ 'data-ega-slot-define-desc': 'true' }}
      />
      {#if defineErr}
        <div class="err" role="alert">{defineErr}</div>
      {/if}
    </div>
  </Dialog>
{/if}

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
  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .err {
    color: var(--color-danger);
    font-size: var(--fs-xs);
  }
</style>
