<script lang="ts">
  import { onMount } from 'svelte';
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
  import type { Settings, Variety, LangSelection } from '@/shared/types';
  import type { ContextMenuItem, MenuLayout, ContextType } from '@/shared/context-menu';
  import {
    DEFAULT_CONTEXT_MENU_ITEMS,
    nextMenuItemId,
    contextsFor,
    withImageSurface,
  } from '@/shared/context-menu';
  import { IMAGE_TASKS } from '@/shared/task-prompts';
  import { materializeTasks, taskLabel, type TaskId, type TaskView } from '@/shared/task-view';
  import { getCustomTasks } from '@/shared/storage';
  import type { CustomTask } from '@/shared/settings-schema';
  import { listVarieties } from '@/shared/varieties';
  import { CONTEXT_MENU_ITEMS_MAX, MENU_LABEL_MAX } from '@/shared/settings-schema';
  import { toastStore } from '@/shared/components/toastStore';
  import { getSettings } from '@/shared/storage';
  import { isShadowRow } from '@/shared/dnd-shadow-row';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import { labelFor } from '@/shared/languages';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
  import { useShadowSync } from '@/shared/svelte/useShadowSync.svelte';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Plus from '@lucide/svelte/icons/plus';
  import Layers from '@lucide/svelte/icons/layers';
  import AlignLeft from '@lucide/svelte/icons/align-left';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Type from '@lucide/svelte/icons/type';
  import Image from '@lucide/svelte/icons/image';
  import FileText from '@lucide/svelte/icons/file-text';
  import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
  import Power from '@lucide/svelte/icons/power';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();

  let customTasks = $state.raw<CustomTask[]>([]);
  const views = $derived(materializeTasks(s, customTasks));
  // An item keeps its own task in the list, disabled, when that task is off or gone.
  const SURFACE_OPTIONS = [
    { value: 'tooltip', label: 'Tooltip' },
    { value: 'sidepanel', label: 'Side panel' },
  ] as const;

  function taskChoices(own: TaskId, image: boolean): { id: TaskId; label: string; off: boolean }[] {
    const from: readonly TaskView[] = image
      ? views.filter((v) => (IMAGE_TASKS as readonly string[]).includes(v.id))
      : views;
    const out = from
      .filter((v) => !v.disabled || v.id === own)
      .map((v) => ({ id: v.id, label: v.label, off: v.disabled }));
    if (!out.some((o) => o.id === own))
      out.push({ id: own, label: taskLabel(views, own), off: true });
    return out;
  }

  // Kinds the user can't duplicate or delete — one per menu by definition
  // (whole-page, element picker, the stateful per-site toggle).
  const SINGLETON_KINDS: ReadonlySet<ContextMenuItem['kind']> = new Set([
    'page-translate',
    'pick-element',
    'site-toggle',
  ] as const);

  function isSingleton(item: ContextMenuItem): boolean {
    return SINGLETON_KINDS.has(item.kind);
  }

  // Presentation map: kind → human label + icon. The raw discriminant
  // ('image-task', 'page-translate') never reaches the UI.
  const KIND_META: Record<ContextMenuItem['kind'], { label: string; icon: typeof Type }> = {
    task: { label: 'Text action', icon: Type },
    'image-task': { label: 'Image action', icon: Image },
    'page-translate': { label: 'Whole page', icon: FileText },
    'pick-element': { label: 'Pick element', icon: MousePointerClick },
    'site-toggle': { label: 'Site toggle', icon: Power },
  };

  // chrome context → "appears when you right-click on …".
  const CONTEXT_LABEL: Record<ContextType, string> = {
    selection: 'Text selection',
    image: 'Image',
    page: 'Page',
    // Listed for exhaustiveness; Ega items only register the three above.
    all: 'Anywhere',
    frame: 'Frame',
    link: 'Link',
    editable: 'Editable',
    video: 'Video',
    audio: 'Audio',
    launcher: 'Launcher',
    browser_action: 'Toolbar',
    page_action: 'Address bar',
    action: 'Toolbar',
    tab: 'Tab',
  };

  function contextLabel(item: ContextMenuItem): string {
    return contextsFor(item)
      .map((c) => CONTEXT_LABEL[c] ?? c)
      .join(', ');
  }

  const layout = $derived<MenuLayout>(s.contextMenuLayout ?? 'nested');

  // Canonical, order-sorted list. patch* always re-normalizes order to the
  // array index so drag, up/down, and add stay consistent.
  const items = $derived(
    (s.contextMenuItems ?? DEFAULT_CONTEXT_MENU_ITEMS).slice().sort((a, b) => a.order - b.order),
  );

  const DEFAULT_ITEMS_JSON = JSON.stringify(
    DEFAULT_CONTEXT_MENU_ITEMS.slice().sort((a, b) => a.order - b.order),
  );

  const isModified = $derived(layout !== 'nested' || JSON.stringify(items) !== DEFAULT_ITEMS_JSON);

  let varieties: Variety[] = $state([]);
  // An item with no language of its own uses the default target, so the picker names it.
  const defaultTargetLabel = $derived.by(() => {
    const id = String(s.defaultTargetLang ?? 'en');
    return varieties.find((v) => v.id === id)?.label ?? labelFor(id);
  });
  onMount(async () => {
    void getCustomTasks().then((rows) => {
      customTasks = rows;
    });
    varieties = await listVarieties();
  });

  // svelte-dnd-action owns the array mid-drag; re-seed only when a stored row changes, keyed on every rendered field.
  const shadow = useShadowSync<ContextMenuItem>({
    seed: () => items,
    keyOf: (xs) => JSON.stringify(xs),
  });

  // Each keystroke would rewrite settings and rebuild every context menu, so the text flushes on debounce or blur.
  const LABEL_DEBOUNCE_MS = 400;
  let pendingLabels: Record<string, string> = {};
  let labelTimer: ReturnType<typeof setTimeout> | null = null;

  function takePendingLabels(): Record<string, string> {
    if (labelTimer !== null) {
      clearTimeout(labelTimer);
      labelTimer = null;
    }
    const edits = pendingLabels;
    pendingLabels = {};
    return edits;
  }

  // Renormalizes order to array position and folds in any label edit still
  // waiting on the debounce, so a click elsewhere in the list cannot drop it.
  function patchItems(next: ContextMenuItem[]): void {
    const edits = takePendingLabels();
    void onPatch({
      contextMenuItems: next.map((item, i) => ({
        ...item,
        label: edits[item.id] ?? item.label,
        order: i,
      })),
    });
  }

  function handleConsider(e: CustomEvent<{ items: ContextMenuItem[] }>): void {
    shadow.items = e.detail.items;
  }

  function handleFinalize(e: CustomEvent<{ items: ContextMenuItem[] }>): void {
    // Drag reorders, it never edits: take the id sequence but the live rows, or
    // the drag zone's pre-rename copies would overwrite a committed label.
    const byId = new Map(items.map((i) => [i.id, i]));
    const finalized = e.detail.items.filter((r) => !isShadowRow(r)).map((r) => byId.get(r.id) ?? r);
    shadow.items = finalized;
    patchItems(finalized);
  }

  function toggleEnabled(id: string): void {
    patchItems(items.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)));
  }

  function updateLabel(id: string, label: string): void {
    pendingLabels[id] = label;
    const base = items;
    if (labelTimer !== null) clearTimeout(labelTimer);
    labelTimer = setTimeout(() => patchItems(base), LABEL_DEBOUNCE_MS);
  }

  function flushLabels(): void {
    if (Object.keys(pendingLabels).length > 0) patchItems(items);
  }

  // A rename typed inside the debounce window would otherwise die with the page.
  $effect(() => {
    window.addEventListener('pagehide', flushLabels);
    return () => {
      window.removeEventListener('pagehide', flushLabels);
      flushLabels();
    };
  });

  function moveUp(idx: number): void {
    if (idx <= 0) return;
    const next = items.slice();
    const moved = next.splice(idx, 1)[0];
    if (!moved) return;
    next.splice(idx - 1, 0, moved);
    patchItems(next);
  }

  function moveDown(idx: number): void {
    if (idx >= items.length - 1) return;
    const next = items.slice();
    const moved = next.splice(idx, 1)[0];
    if (!moved) return;
    next.splice(idx + 1, 0, moved);
    patchItems(next);
  }

  function deleteItem(id: string): void {
    const at = items.findIndex((item) => item.id === id);
    const removed = items[at];
    if (!removed) return;
    patchItems(items.filter((item) => item.id !== id));
    toastStore.push({
      message: `Removed "${removed.label}".`,
      variant: 'success',
      action: { label: 'Undo', onClick: () => void restoreItem(removed, at) },
    });
  }

  async function restoreItem(removed: ContextMenuItem, at: number): Promise<void> {
    // Re-read at click time: the prop is a snapshot, and Undo would drop the edits since.
    const stored = (await getSettings()).contextMenuItems ?? DEFAULT_CONTEXT_MENU_ITEMS;
    // Filtered first: Undo clicked before the delete write lands would otherwise duplicate the id.
    const next = stored
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((it) => it.id !== removed.id);
    next.splice(Math.min(at, next.length), 0, removed);
    patchItems(next);
  }

  function addItem(kind: 'task' | 'image-task'): void {
    if (items.length >= CONTEXT_MENU_ITEMS_MAX) {
      toastStore.push({
        message: `Menu limit is ${CONTEXT_MENU_ITEMS_MAX} items — delete one before adding another.`,
        variant: 'warning',
      });
      return;
    }
    const imageSurface = s.imageTranslateSurface;
    const id = nextMenuItemId(items, kind, kind === 'image-task' ? imageSurface : 'tooltip');
    const base = { id, enabled: true, order: items.length };
    const newItem: ContextMenuItem =
      kind === 'image-task'
        ? {
            ...base,
            kind: 'image-task',
            label: 'Translate image with Ega',
            task: 'translate',
            surface: imageSurface,
          }
        : {
            ...base,
            kind: 'task',
            label: 'New text action',
            task: 'translate',
            surface: 'tooltip',
          };
    patchItems([...items, newItem]);
  }

  function setTask(id: string, val: string): void {
    patchItems(
      items.map((it) => {
        if (it.id !== id) return it;
        if (it.kind === 'task') return { ...it, task: val as typeof it.task };
        if (it.kind === 'image-task' && (val === 'translate' || val === 'explain'))
          return { ...it, task: val };
        return it;
      }),
    );
  }

  function setSurface(id: string, val: 'tooltip' | 'sidepanel'): void {
    patchItems(
      items.map((it) => {
        if (it.id !== id) return it;
        if (it.kind !== 'task' && it.kind !== 'image-task') return it;
        // Re-mint the id so it always encodes the surface — the cold-SW click decides from the id alone.
        return { ...it, surface: val, id: nextMenuItemId(items, it.kind, val) };
      }),
    );
  }

  // 'auto' (the LanguagePicker auto sentinel) clears the per-item override so
  // the click falls back to Settings.defaultTargetLang in the background.
  function setTargetLang(id: string, val: string): void {
    patchItems(
      items.map((it) => {
        if (it.id !== id || it.kind !== 'task') return it;
        if (val === 'auto') {
          const next = { ...it };
          delete next.targetLang;
          return next;
        }
        return { ...it, targetLang: val as LangSelection };
      }),
    );
  }

  function onLayoutChange(next: string): void {
    void onPatch({ contextMenuLayout: next as MenuLayout });
  }

  function resetDefaults(): void {
    takePendingLabels();
    void onPatch({
      contextMenuItems: withImageSurface(
        structuredClone(DEFAULT_CONTEXT_MENU_ITEMS),
        s.imageTranslateSurface,
      ),
      contextMenuLayout: 'nested',
    });
  }
</script>

<SectionCard
  title="Context menu"
  description="Pick the layout, then enable, reorder, relabel, and configure the right-click entries."
>
  {#snippet headerActions()}
    <span class="cm-head-actions">
      <SectionReset
        modified={isModified}
        onReset={resetDefaults}
        ariaLabel="Reset context menu to defaults"
      />
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={Plus}
        dataAttrs={{ 'data-ega-cm-add': true }}
        onclick={() => addItem('task')}>Add text action</Button
      >
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={Image}
        dataAttrs={{ 'data-ega-cm-add-image': true }}
        onclick={() => addItem('image-task')}>Add image action</Button
      >
    </span>
  {/snippet}

  <div class="cm-layout-row">
    <span class="cm-layout-label" id="cm-layout-label">Layout</span>
    <RadioGroup
      name="contextMenuLayout"
      value={layout}
      dataAttrs={{ 'data-ega-cm-layout': true, 'aria-labelledby': 'cm-layout-label' }}
      orientation="horizontal"
      options={[
        {
          value: 'nested',
          label: 'Nested',
          icon: Layers,
          description: 'Items grouped under Ega ▸',
        },
        { value: 'flat', label: 'Flat', icon: AlignLeft, description: 'Each item at top level' },
      ]}
      onValueChange={onLayoutChange}
    />
  </div>

  <ul
    class="cm-list"
    aria-label="Menu items"
    use:dragHandleZone={{ items: shadow.items, dragDisabled: false, flipDurationMs: 160 }}
    onconsider={handleConsider}
    onfinalize={handleFinalize}
  >
    {#each shadow.items as item, idx (item.id)}
      {#if isShadowRow(item)}
        <li class="cm-row cm-row-shadow" aria-hidden="true">
          <span class="cm-shadow-slot">Drop here</span>
        </li>
      {:else}
        {@const Icon = KIND_META[item.kind].icon}
        {@const labelMissing = item.label.trim() === ''}
        <li class="cm-row" data-ega-cm-row data-ega-cm-id={item.id}>
          <div class="cm-row-main">
            <span
              class="cm-handle"
              aria-label="Drag to reorder {item.label}"
              data-ega-cm-handle
              use:dragHandle
            >
              <GripVertical size={16} aria-hidden="true" />
            </span>

            <Checkbox
              checked={item.enabled}
              ariaLabel="Enable {item.label}"
              inputAttrs={{ 'data-ega-cm-enabled': true }}
              onchange={() => toggleEnabled(item.id)}
            />

            <span class="cm-kind" title={KIND_META[item.kind].label}>
              <Icon size={15} aria-hidden="true" />
            </span>

            <label class="cm-label-wrap">
              <span class="ega-sr-only">Label for {item.label}</span>
              <input
                class="cm-label-input"
                class:cm-label-empty={labelMissing}
                type="text"
                dir="auto"
                value={item.label}
                maxlength={MENU_LABEL_MAX}
                placeholder="Menu label"
                aria-invalid={labelMissing}
                aria-describedby={labelMissing ? `cm-label-error-${item.id}` : undefined}
                data-ega-cm-label
                oninput={(e) => updateLabel(item.id, (e.currentTarget as HTMLInputElement).value)}
                onblur={flushLabels}
              />
              {#if labelMissing}
                <span class="cm-label-error" id="cm-label-error-{item.id}" data-ega-cm-label-error
                  >Menu label required</span
                >
              {/if}
            </label>

            <span class="cm-context-chip" data-ega-cm-context>{contextLabel(item)}</span>

            <span class="cm-reorder">
              <IconButton
                icon={ArrowUp}
                ariaLabel="Move up"
                size="sm"
                disabled={idx === 0}
                dataAttrs={{ 'data-ega-cm-up': true }}
                onclick={() => moveUp(idx)}
              />
              <IconButton
                icon={ArrowDown}
                ariaLabel="Move down"
                size="sm"
                disabled={idx === shadow.items.length - 1}
                dataAttrs={{ 'data-ega-cm-down': true }}
                onclick={() => moveDown(idx)}
              />
            </span>

            <span class="cm-end">
              {#if isSingleton(item)}
                <span class="cm-builtin">Built-in</span>
              {:else}
                <IconButton
                  icon={Trash2}
                  ariaLabel={`Delete ${item.label}`}
                  tooltip="Delete item"
                  size="sm"
                  variant="danger"
                  dataAttrs={{ 'data-ega-cm-delete': true }}
                  onclick={() => deleteItem(item.id)}
                />
              {/if}
            </span>
          </div>

          {#if item.kind === 'task' || item.kind === 'image-task'}
            <div class="cm-detail" data-ega-cm-detail>
              <label class="cm-inline-label">
                Task
                <Select
                  value={item.task}
                  options={taskChoices(item.task, item.kind === 'image-task').map((o) => ({
                    value: o.id,
                    label: o.label,
                    disabled: o.off,
                  }))}
                  size="sm"
                  selectAttrs={{ 'data-ega-cm-task': true }}
                  onchange={(v) => setTask(item.id, v)}
                />
              </label>

              <label class="cm-inline-label">
                Open in
                <Select
                  value={item.surface}
                  options={SURFACE_OPTIONS}
                  size="sm"
                  selectAttrs={{ 'data-ega-cm-surface': true }}
                  onchange={(v) => setSurface(item.id, v)}
                />
              </label>

              {#if item.kind === 'task'}
                <label class="cm-inline-label cm-lang-wrap" data-ega-cm-targetlang>
                  Into
                  <LanguagePicker
                    id="cm-lang-{item.id}"
                    {varieties}
                    includeAuto
                    autoLabel={`Default target (${defaultTargetLabel})`}
                    value={item.targetLang ?? 'auto'}
                    ariaLabel="Target language for {item.label}"
                    onchange={(v) => setTargetLang(item.id, v)}
                  />
                </label>
              {/if}
            </div>
          {/if}
        </li>
      {/if}
    {/each}
  </ul>
</SectionCard>

<style>
  .cm-head-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .cm-layout-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .cm-layout-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }

  .cm-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .cm-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }

  .cm-row-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .cm-handle {
    display: inline-flex;
    align-items: center;
    color: var(--color-fg-subtle);
    cursor: grab;
    flex: 0 0 auto;
    border-radius: var(--radius-sm);
  }
  .cm-handle:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .cm-handle:active {
    cursor: grabbing;
  }

  .cm-kind {
    display: inline-flex;
    align-items: center;
    color: var(--color-fg-subtle);
    flex: 0 0 auto;
  }

  .cm-row-shadow {
    pointer-events: none;
  }
  .cm-shadow-slot {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    width: 100%;
    border: 2px dashed var(--color-accent);
    border-radius: var(--radius-md);
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .cm-label-wrap {
    flex: 1 1 auto;
    min-width: 0;
  }

  .cm-label-input {
    width: 100%;
    font-size: var(--fs-base);
    font-family: var(--font-ui);
    color: var(--color-fg);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-2);
    outline: none;
  }
  .cm-label-input:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-bg-soft);
  }
  .cm-label-empty {
    border-color: var(--color-danger, var(--color-border));
  }
  .cm-label-error {
    display: block;
    font-size: var(--fs-xs);
    color: var(--color-danger, var(--color-fg));
  }

  .cm-context-chip {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    background: var(--color-bg-hover);
    border-radius: var(--radius-pill);
    padding: 1px var(--space-2);
    white-space: nowrap;
    flex: 0 0 auto;
  }

  /* One width for the trash and the "Built-in" text, so every label field ends at one line. */
  .cm-end {
    flex: 0 0 auto;
    width: 3.5rem;
    display: inline-flex;
    justify-content: flex-end;
  }
  .cm-builtin {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .cm-reorder {
    display: inline-flex;
    gap: 2px;
    flex: 0 0 auto;
  }

  .cm-detail {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    /* align under the label, past handle + checkbox + kind icon */
    padding-inline-start: calc(16px + 16px + 15px + var(--space-2) * 3);
  }

  .cm-inline-label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-fg-subtle);
    white-space: nowrap;
  }
</style>
