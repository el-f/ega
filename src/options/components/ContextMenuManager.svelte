<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
  import type { Settings, Variety, LangSelection } from '@/shared/types';
  import {
    DEFAULT_CONTEXT_MENU_ITEMS,
    menuGroupOf,
    nextMenuItemId,
    type ContextMenuItem,
    type MenuGroup,
    type MenuSurface,
  } from '@/shared/context-menu';
  import {
    autoMenuName,
    customMenuLabel,
    isMenuModified,
    isShippedItem,
    withShippedIds,
    type MenuNameLookup,
  } from '@/shared/context-menu-names';
  import { builtInTask, runnableDefaultTask } from '@/shared/task-prompts';
  import { materializeTasks, taskLabel, type TaskId } from '@/shared/task-view';
  import { getCustomTasks, getSettings } from '@/shared/storage';
  import type { CustomTask } from '@/shared/settings-schema';
  import { listVarieties } from '@/shared/varieties';
  import { CONTEXT_MENU_ITEMS_MAX, MENU_LABEL_MAX } from '@/shared/settings-schema';
  import { toastStore } from '@/shared/components/toastStore';
  import { isShadowRow } from '@/shared/dnd-shadow-row';
  import { labelFor } from '@/shared/languages';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
  import { useShadowSync } from '@/shared/svelte/useShadowSync.svelte';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
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

  // One box per menu Chrome draws, in Chrome's own order of likelihood.
  const GROUPS = [
    {
      id: 'selection',
      title: 'Selected text',
      hint: 'right-click on a selection',
      add: 'task',
      addLabel: 'Add text action',
    },
    {
      id: 'image',
      title: 'Images',
      hint: 'right-click on an image',
      add: 'image-task',
      addLabel: 'Add image action',
    },
    { id: 'page', title: 'Page', hint: 'right-click on empty page space', add: null, addLabel: '' },
  ] as const satisfies ReadonlyArray<{
    id: MenuGroup;
    title: string;
    hint: string;
    add: 'task' | 'image-task' | null;
    addLabel: string;
  }>;

  const KIND_ICON: Record<ContextMenuItem['kind'], typeof Type> = {
    task: Type,
    'image-task': Image,
    'page-translate': FileText,
    'pick-element': MousePointerClick,
    'site-toggle': Power,
  };

  const OPENS_IN = [
    { value: 'tooltip', label: 'On the page' },
    { value: 'sidepanel', label: 'Side panel' },
  ];
  const IMAGE_TASK_CHOICES = [
    { value: 'translate', label: 'Translate' },
    { value: 'explain', label: 'Explain' },
  ];
  // A group this long stops being a menu people scan (R28); the card says so but does not block.
  const LONG_GROUP = 11;

  let customTasks = $state.raw<CustomTask[]>([]);
  let tasksLoaded = $state(false);
  let varieties: Variety[] = $state([]);
  const views = $derived(materializeTasks(s, customTasks));

  onMount(async () => {
    void getCustomTasks().then((rows) => {
      customTasks = rows;
      tasksLoaded = true;
    });
    varieties = await listVarieties();
  });

  // Plain functions: they read views and varieties when the template calls them, so renders track both.
  const lookup: MenuNameLookup = {
    taskLabel: (id) => taskLabel(views, id),
    langLabel: (id) => varieties.find((v) => v.id === id)?.label ?? labelFor(id),
  };
  const defaultLangLabel = $derived(lookup.langLabel(String(s.defaultTargetLang)));

  // Sorted by stored order; older re-minted shipped rows get their shipped id back so they stay undeletable.
  const items = $derived(
    withShippedIds((s.contextMenuItems ?? DEFAULT_CONTEXT_MENU_ITEMS).slice()).sort(
      (a, b) => a.order - b.order,
    ),
  );
  const isModified = $derived(isMenuModified(items));
  const full = $derived(items.length >= CONTEXT_MENU_ITEMS_MAX);

  function groupRows(g: MenuGroup): ContextMenuItem[] {
    return items.filter((i) => menuGroupOf(i) === g);
  }

  // svelte-dnd-action owns each group's array mid-drag; re-seed only when a stored row changes.
  const shadows: Record<MenuGroup, { items: ContextMenuItem[] }> = {
    selection: useShadowSync<ContextMenuItem>({
      seed: () => groupRows('selection'),
      keyOf: (xs) => JSON.stringify(xs),
    }),
    image: useShadowSync<ContextMenuItem>({
      seed: () => groupRows('image'),
      keyOf: (xs) => JSON.stringify(xs),
    }),
    page: useShadowSync<ContextMenuItem>({
      seed: () => groupRows('page'),
      keyOf: (xs) => JSON.stringify(xs),
    }),
  };

  /** A custom task's name is not known until the task list loads; null shows "Loading…", never "Deleted task". */
  function nameOf(item: ContextMenuItem): string | null {
    const custom = customMenuLabel(item);
    if (custom !== '') return custom;
    if (item.kind === 'task' && !tasksLoaded && builtInTask(item.task) === null) return null;
    return autoMenuName(item, lookup);
  }

  function displayName(item: ContextMenuItem): string {
    return nameOf(item) ?? 'Loading…';
  }

  /** Why Chrome leaves a row out, or null when it shows. `blocked` = the checkbox cannot bring it back. */
  function statusOf(item: ContextMenuItem): { text: string; blocked: boolean } | null {
    if (item.kind === 'task' || item.kind === 'image-task') {
      const known = tasksLoaded || builtInTask(item.task) !== null;
      const view = views.find((v) => v.id === item.task);
      if (known && !view) return { text: 'Hidden: its task was deleted', blocked: true };
      if (view?.disabled) return { text: `Hidden: ${view.label} is off in Tasks`, blocked: true };
    }
    if (item.kind === 'pick-element' && !s.pickerEnabled) {
      return { text: 'Hidden: the element picker is off', blocked: true };
    }
    if (!item.enabled && item.kind !== 'site-toggle') return { text: 'Hidden', blocked: false };
    return null;
  }

  function shownCount(g: MenuGroup): number {
    return groupRows(g).filter((i) => statusOf(i) === null).length;
  }

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

  // Writes the rows group by group, renumbers order, and folds in any label edit still waiting on the debounce.
  async function patchItems(next: readonly ContextMenuItem[]): Promise<void> {
    const edits = takePendingLabels();
    const grouped = GROUPS.flatMap((g) => next.filter((i) => menuGroupOf(i) === g.id));
    await onPatch({
      contextMenuItems: grouped.map((item, i) => ({
        ...item,
        label: edits[item.id] ?? item.label,
        order: i,
      })),
    });
  }

  function patchGroup(g: MenuGroup, rows: readonly ContextMenuItem[]): Promise<void> {
    return patchItems(GROUPS.flatMap((x) => (x.id === g ? rows : groupRows(x.id))));
  }

  function patchItem(id: string, change: (item: ContextMenuItem) => ContextMenuItem): void {
    void patchItems(items.map((it) => (it.id === id ? change(it) : it)));
  }

  function updateLabel(id: string, label: string): void {
    pendingLabels[id] = label;
    if (labelTimer !== null) clearTimeout(labelTimer);
    labelTimer = setTimeout(() => void patchItems(items), LABEL_DEBOUNCE_MS);
  }

  function flushLabels(): void {
    if (Object.keys(pendingLabels).length > 0) void patchItems(items);
  }

  // A rename typed inside the debounce window would otherwise die with the page.
  $effect(() => {
    window.addEventListener('pagehide', flushLabels);
    return () => {
      window.removeEventListener('pagehide', flushLabels);
      flushLabels();
    };
  });

  let cardEl = $state<HTMLElement | null>(null);
  let announcement = $state('');
  let openId = $state<string | null>(null);

  type Tool = 'up' | 'down' | 'edit';
  const TOOL_SELECTOR: Record<Tool, string> = {
    up: '[data-ega-cm-up]',
    down: '[data-ega-cm-down]',
    edit: '[data-ega-cm-edit]',
  };
  // Roving tab stop per row toolbar; Edit is the default stop.
  let activeTool = $state<Record<string, Tool>>({});

  function rowEl(id: string): HTMLElement | null {
    return cardEl?.querySelector<HTMLElement>(`[data-ega-cm-id="${CSS.escape(id)}"]`) ?? null;
  }

  async function focusTool(id: string, tool: Tool): Promise<void> {
    activeTool[id] = tool;
    await tick();
    rowEl(id)?.querySelector<HTMLElement>(TOOL_SELECTOR[tool])?.focus();
  }

  function toolsOf(rows: readonly ContextMenuItem[], idx: number): Tool[] {
    const out: Tool[] = [];
    if (idx > 0) out.push('up');
    if (idx < rows.length - 1) out.push('down');
    out.push('edit');
    return out;
  }

  // One tab stop per row; arrows skip the arrow that cannot move (R48).
  function onToolbarKeydown(e: KeyboardEvent, id: string, enabled: Tool[]): void {
    const current = activeTool[id] ?? 'edit';
    const idx = enabled.indexOf(current);
    let next: number;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    else return;
    e.preventDefault();
    const tool = enabled[next];
    if (tool !== undefined) void focusTool(id, tool);
  }

  // A click moves focus without the arrow keys, so the roving stop follows it.
  function onToolbarFocusIn(e: FocusEvent, id: string): void {
    const target = e.target as HTMLElement | null;
    const tool = (Object.keys(TOOL_SELECTOR) as Tool[]).find((t) =>
      target?.closest(TOOL_SELECTOR[t]),
    );
    if (tool) activeTool[id] = tool;
  }

  async function move(item: ContextMenuItem, delta: -1 | 1, tool: Tool): Promise<void> {
    const g = menuGroupOf(item);
    const rows = groupRows(g);
    const from = rows.findIndex((r) => r.id === item.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rows.length) return;
    const next = rows.slice();
    next.splice(from, 1);
    next.splice(to, 0, item);
    await patchGroup(g, next);
    announcement = `${displayName(item)} moved to position ${to + 1} of ${rows.length}`;
    // Focus stays on the pressed button of the moved row, even when it is now the disabled end.
    await focusTool(item.id, tool);
  }

  function toggleOpen(id: string): void {
    openId = openId === id ? null : id;
  }

  /** Esc anywhere in a row's options closes them and puts focus back on its Edit. Delegated, so every field gets it. */
  function escapeCloses(
    node: HTMLElement,
    id: string,
  ): { update: (next: string) => void; destroy: () => void } {
    let rowId = id;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || openId !== rowId) return;
      e.preventDefault();
      e.stopPropagation();
      openId = null;
      void focusTool(rowId, 'edit');
    };
    node.addEventListener('keydown', onKey);
    return {
      update(next) {
        rowId = next;
      },
      destroy() {
        node.removeEventListener('keydown', onKey);
      },
    };
  }

  async function addItem(kind: 'task' | 'image-task'): Promise<void> {
    if (full) return;
    const surface: MenuSurface = kind === 'image-task' ? 'sidepanel' : 'tooltip';
    const id = nextMenuItemId(items, kind, surface);
    const base = { id, enabled: true, order: items.length, label: '' };
    const added: ContextMenuItem =
      kind === 'image-task'
        ? { ...base, kind, task: 'translate', surface }
        : { ...base, kind, task: runnableDefaultTask(s) as TaskId, surface };
    await patchItems([...items, added]);
    openId = id;
    await tick();
    const row = rowEl(id);
    row
      ?.querySelector<HTMLElement>(
        '[data-ega-cm-task] [role="radio"][data-state="checked"], select[data-ega-cm-task]',
      )
      ?.focus();
  }

  async function deleteItem(item: ContextMenuItem): Promise<void> {
    const g = menuGroupOf(item);
    const rows = groupRows(g);
    const idx = rows.findIndex((r) => r.id === item.id);
    const at = items.findIndex((r) => r.id === item.id);
    const name = displayName(item);
    openId = null;
    await patchItems(items.filter((r) => r.id !== item.id));
    toastStore.push({
      message: `Removed "${name}".`,
      variant: 'success',
      duration: 8000,
      action: { label: 'Undo', onClick: () => void restoreItem(item, at) },
    });
    const neighbour = rows[idx + 1] ?? rows[idx - 1];
    if (neighbour) await focusTool(neighbour.id, 'edit');
    else {
      await tick();
      cardEl?.querySelector<HTMLElement>(`[data-ega-cm-group="${g}"] .cm-add button`)?.focus();
    }
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
    await patchItems(next);
    await focusTool(removed.id, 'edit');
  }

  async function resetDefaults(): Promise<void> {
    takePendingLabels();
    const before = items;
    openId = null;
    await onPatch({ contextMenuItems: structuredClone(DEFAULT_CONTEXT_MENU_ITEMS) });
    toastStore.push({
      message: 'Right-click menu reset.',
      variant: 'success',
      duration: 8000,
      action: { label: 'Undo', onClick: () => void onPatch({ contextMenuItems: before }) },
    });
    // The Reset button is gone now, so focus would drop to the page.
    await tick();
    cardEl
      ?.querySelector<HTMLElement>('[data-ega-cm-group="selection"] [data-ega-cm-enabled]')
      ?.focus();
  }

  function setTask(id: string, val: string): void {
    patchItem(id, (it) => {
      if (it.kind === 'task') return { ...it, task: val as TaskId };
      if (it.kind === 'image-task' && (val === 'translate' || val === 'explain'))
        return { ...it, task: val };
      return it;
    });
  }

  // The id keeps its value: the row stays mounted and the radio keeps focus. The background
  // registers an id that encodes the surface, which is all the cold-worker click reads.
  function setSurface(id: string, val: string): void {
    if (val !== 'tooltip' && val !== 'sidepanel') return;
    patchItem(id, (it) =>
      it.kind === 'task' || it.kind === 'image-task' ? { ...it, surface: val } : it,
    );
  }

  // 'auto' is the picker's "Default (…)" entry: no language of its own, so the click uses the default target.
  function setTargetLang(id: string, val: string): void {
    patchItem(id, (it) => {
      if (it.kind !== 'task') return it;
      if (val === 'auto') {
        const next = { ...it };
        delete next.targetLang;
        return next;
      }
      return { ...it, targetLang: val as LangSelection };
    });
  }

  function taskChoices(own: TaskId): { value: string; label: string; disabled: boolean }[] {
    const out = views.map((v) => ({
      value: v.id as string,
      label: v.disabled ? `${v.label} (off)` : v.label,
      disabled: v.disabled,
    }));
    if (!out.some((o) => o.value === own)) {
      out.push({
        value: own,
        label: tasksLoaded ? 'Deleted task' : 'Loading…',
        disabled: true,
      });
    }
    return out;
  }

  /** The library makes a handle a focusable button; this grip is pointer only, Move up/down is the keyboard path. */
  function pointerGrip(node: HTMLElement): { destroy: () => void } {
    const handle = dragHandle(node);
    const quiet = (): void => {
      if (node.tabIndex !== -1) node.tabIndex = -1;
      if (node.hasAttribute('role')) node.removeAttribute('role');
    };
    quiet();
    const watcher = new MutationObserver(quiet);
    watcher.observe(node, { attributes: true, attributeFilter: ['tabindex', 'role'] });
    return {
      destroy() {
        watcher.disconnect();
        handle.destroy();
      },
    };
  }

  function handleConsider(g: MenuGroup, e: CustomEvent<{ items: ContextMenuItem[] }>): void {
    shadows[g].items = e.detail.items;
  }

  function handleFinalize(g: MenuGroup, e: CustomEvent<{ items: ContextMenuItem[] }>): void {
    // Drag reorders, it never edits: take the id sequence but the live rows, or
    // the drag zone's pre-rename copies would overwrite a committed label.
    const byId = new Map(items.map((i) => [i.id, i]));
    const rows = e.detail.items.filter((r) => !isShadowRow(r)).map((r) => byId.get(r.id) ?? r);
    shadows[g].items = rows;
    void patchGroup(g, rows);
  }

  const flipMs = $derived(prefersReducedMotion.current ? 0 : 160);
</script>

<div bind:this={cardEl} data-ega-setting="contextMenu.items" class="cm-card">
  <SectionCard
    title="Right-click menu"
    description="What Ega adds when you right-click a web page"
    info={{
      label: 'About the right-click menu',
      text: 'Chrome shows only the items that match what you right-click, under Ega ▸. Uncheck an item to hide it; you can delete only items you added.',
    }}
  >
    {#snippet headerActions()}
      <SectionReset
        modified={isModified}
        onReset={resetDefaults}
        ariaLabel="Reset section: Right-click menu"
      />
    {/snippet}

    <p class="ega-sr-only" role="status">{announcement}</p>

    <div class="cm-groups">
      {#each GROUPS as g (g.id)}
        {@const shown = shownCount(g.id)}
        {@const headingId = `cm-group-${g.id}`}
        <section class="cm-group" aria-labelledby={headingId} data-ega-cm-group={g.id}>
          <div class="cm-group-head">
            <h3 class="cm-group-title" id={headingId}>{g.title}</h3>
            <span class="cm-group-hint" aria-hidden="true">·</span>
            <span class="cm-group-hint">{g.hint}</span>
          </div>
          <div class="cm-box">
            <p class="cm-preview" aria-hidden="true" data-ega-cm-preview>
              {shown > 0 ? 'Ega ▸' : 'Nothing from Ega shows here'}
            </p>
            <span id="{headingId}-desc" hidden
              >{shown > 0
                ? `Shows in Chrome under Ega, ${shown} ${shown === 1 ? 'item' : 'items'}`
                : 'Nothing from Ega shows here'}</span
            >
            <ul
              class="cm-list"
              aria-labelledby={headingId}
              aria-describedby="{headingId}-desc"
              use:dragHandleZone={{
                items: shadows[g.id].items,
                type: g.id,
                flipDurationMs: flipMs,
                dropTargetStyle: {},
                // Pointer-only drag: the zone takes no tab stop and keeps the list's own name and description.
                zoneTabIndex: -1,
                autoAriaDisabled: true,
              }}
              onconsider={(e) => handleConsider(g.id, e)}
              onfinalize={(e) => handleFinalize(g.id, e)}
            >
              {#each shadows[g.id].items as item, idx (item.id)}
                {#if isShadowRow(item)}
                  <li class="cm-row cm-row-shadow" aria-hidden="true">
                    <span class="cm-shadow-slot">Drop here</span>
                  </li>
                {:else}
                  {@const Icon = KIND_ICON[item.kind]}
                  {@const rows = shadows[g.id].items}
                  {@const name = displayName(item)}
                  {@const status = statusOf(item)}
                  {@const statusId = `cm-status-${item.id}`}
                  {@const optsId = `cm-opts-${item.id}`}
                  {@const isOpen = openId === item.id}
                  {@const atTop = idx === 0}
                  {@const atEnd = idx === rows.length - 1}
                  {@const tools = toolsOf(rows, idx)}
                  {@const tool = activeTool[item.id] ?? 'edit'}
                  <li
                    class="cm-row"
                    class:is-open={isOpen}
                    data-ega-cm-row
                    data-ega-cm-id={item.id}
                  >
                    <div class="cm-row-main">
                      <span class="cm-handle" aria-hidden="true" data-ega-cm-handle use:pointerGrip>
                        <GripVertical size={16} />
                      </span>

                      {#if item.kind === 'site-toggle'}
                        <span class="cm-check-spacer" aria-hidden="true"></span>
                      {:else}
                        <!-- A blocked row keeps its box focusable (aria-disabled), so its reason is read; the click does nothing. -->
                        <span
                          class="cm-check"
                          onclickcapture={(e) => {
                            if (status?.blocked) e.preventDefault();
                          }}
                        >
                          <Checkbox
                            checked={item.enabled}
                            ariaLabel="Show {name}"
                            inputAttrs={{
                              'data-ega-cm-enabled': true,
                              'aria-describedby': status ? statusId : undefined,
                              'aria-disabled': status?.blocked ? 'true' : undefined,
                            }}
                            onchange={() =>
                              patchItem(item.id, (it) => ({ ...it, enabled: !it.enabled }))}
                          />
                        </span>
                      {/if}

                      <span class="cm-kind" aria-hidden="true"><Icon size={16} /></span>

                      <span class="cm-text">
                        <span
                          class="cm-name"
                          class:is-hidden={status !== null}
                          class:is-loading={nameOf(item) === null}
                          dir="auto"
                          data-ega-cm-name>{name}</span
                        >
                        {#if item.kind === 'site-toggle'}
                          <span class="cm-status" data-ega-cm-site-note
                            >Shows "Enable Ega on this site" on sites where Ega is off</span
                          >
                        {:else if status}
                          <span class="cm-status" id={statusId} data-ega-cm-status
                            >{status.text}</span
                          >
                        {/if}
                      </span>

                      {#if item.kind === 'site-toggle'}
                        <span class="cm-tools">
                          <IconButton
                            icon={ArrowUp}
                            ariaLabel={atTop ? `Move ${name} up, already first` : `Move ${name} up`}
                            tooltip="Move up"
                            size="sm"
                            dataAttrs={{
                              'data-ega-cm-up': true,
                              'aria-disabled': atTop ? 'true' : undefined,
                            }}
                            onclick={() => void move(item, -1, 'up')}
                          />
                          <IconButton
                            icon={ArrowDown}
                            ariaLabel={atEnd
                              ? `Move ${name} down, already last`
                              : `Move ${name} down`}
                            tooltip="Move down"
                            size="sm"
                            dataAttrs={{
                              'data-ega-cm-down': true,
                              'aria-disabled': atEnd ? 'true' : undefined,
                            }}
                            onclick={() => void move(item, 1, 'down')}
                          />
                        </span>
                      {:else}
                        <div
                          class="cm-tools"
                          role="toolbar"
                          tabindex="-1"
                          aria-label="Actions for {name}"
                          onkeydown={(e) => onToolbarKeydown(e, item.id, tools)}
                          onfocusin={(e) => onToolbarFocusIn(e, item.id)}
                        >
                          <IconButton
                            icon={ArrowUp}
                            ariaLabel={atTop ? `Move ${name} up, already first` : `Move ${name} up`}
                            tooltip="Move up"
                            size="sm"
                            dataAttrs={{
                              'data-ega-cm-up': true,
                              'aria-disabled': atTop ? 'true' : undefined,
                              tabindex: tool === 'up' ? 0 : -1,
                            }}
                            onclick={() => void move(item, -1, 'up')}
                          />
                          <IconButton
                            icon={ArrowDown}
                            ariaLabel={atEnd
                              ? `Move ${name} down, already last`
                              : `Move ${name} down`}
                            tooltip="Move down"
                            size="sm"
                            dataAttrs={{
                              'data-ega-cm-down': true,
                              'aria-disabled': atEnd ? 'true' : undefined,
                              tabindex: tool === 'down' ? 0 : -1,
                            }}
                            onclick={() => void move(item, 1, 'down')}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            ariaLabel="Edit {name}"
                            dataAttrs={{
                              'data-ega-cm-edit': true,
                              'aria-expanded': isOpen ? 'true' : 'false',
                              'aria-controls': optsId,
                              tabindex: tool === 'edit' ? 0 : -1,
                            }}
                            onclick={() => toggleOpen(item.id)}
                            >Edit{#if isOpen}<ChevronUp
                                size={16}
                                aria-hidden="true"
                              />{:else}<ChevronDown size={16} aria-hidden="true" />{/if}</Button
                          >
                        </div>
                      {/if}
                    </div>

                    {#if item.kind !== 'site-toggle'}
                      <div
                        id={optsId}
                        class="cm-opts-wrap"
                        role="group"
                        aria-label="Options for {name}"
                        hidden={!isOpen}
                        use:escapeCloses={item.id}
                      >
                        <CollapsibleField open={isOpen}>
                          <div class="cm-opts" data-ega-cm-options>
                            {#if item.kind === 'task'}
                              <label class="cm-field-label" for="cm-task-{item.id}">Task</label>
                              <div class="cm-field">
                                <Select
                                  id="cm-task-{item.id}"
                                  value={item.task as string}
                                  options={taskChoices(item.task)}
                                  size="sm"
                                  selectAttrs={{
                                    'data-ega-cm-task': true,
                                    disabled:
                                      !tasksLoaded && builtInTask(item.task) === null
                                        ? true
                                        : undefined,
                                  }}
                                  onchange={(v) => setTask(item.id, v)}
                                />
                              </div>
                            {:else if item.kind === 'image-task'}
                              <span class="cm-field-label is-radio" id="cm-task-{item.id}"
                                >Task</span
                              >
                              <div class="cm-field">
                                <RadioGroup
                                  value={item.task}
                                  options={IMAGE_TASK_CHOICES}
                                  orientation="horizontal"
                                  dataAttrs={{
                                    'data-ega-cm-task': true,
                                    'aria-labelledby': `cm-task-${item.id}`,
                                  }}
                                  onValueChange={(v) => setTask(item.id, v)}
                                />
                              </div>
                            {/if}

                            {#if item.kind === 'task' || item.kind === 'image-task'}
                              <span class="cm-field-label is-radio" id="cm-surface-{item.id}"
                                >Opens in</span
                              >
                              <div class="cm-field">
                                <RadioGroup
                                  value={item.surface}
                                  options={OPENS_IN}
                                  orientation="horizontal"
                                  dataAttrs={{
                                    'data-ega-cm-surface': true,
                                    'aria-labelledby': `cm-surface-${item.id}`,
                                    'aria-describedby': `cm-surface-hint-${item.id}`,
                                  }}
                                  onValueChange={(v) => setSurface(item.id, v)}
                                />
                                <span class="cm-hint" id="cm-surface-hint-{item.id}"
                                  >{item.kind === 'task'
                                    ? 'On the page uses your Display surface choice: tooltip or inline'
                                    : 'On the page shows a tooltip on the image'}</span
                                >
                              </div>
                            {/if}

                            {#if item.kind === 'task'}
                              <label class="cm-field-label" for="cm-lang-{item.id}">Answer in</label
                              >
                              <div class="cm-field" data-ega-cm-targetlang>
                                <LanguagePicker
                                  id="cm-lang-{item.id}"
                                  {varieties}
                                  includeAuto
                                  suppressAriaLabel
                                  autoLabel="Default ({defaultLangLabel})"
                                  value={item.targetLang ?? 'auto'}
                                  onchange={(v) => setTargetLang(item.id, v)}
                                />
                              </div>
                            {/if}

                            <label class="cm-field-label" for="cm-name-{item.id}"
                              >Name in menu</label
                            >
                            <div class="cm-field">
                              <Input
                                id="cm-name-{item.id}"
                                size="sm"
                                value={customMenuLabel(item)}
                                maxlength={MENU_LABEL_MAX}
                                dataAttrs={{
                                  'data-ega-cm-label': true,
                                  'aria-describedby': `cm-name-hint-${item.id}`,
                                }}
                                oninput={(e) =>
                                  updateLabel(item.id, (e.currentTarget as HTMLInputElement).value)}
                                onblur={flushLabels}
                              />
                              <span class="cm-hint" id="cm-name-hint-{item.id}"
                                >Leave empty to use "{autoMenuName(item, lookup)}"</span
                              >
                            </div>

                            {#if !isShippedItem(item)}
                              <span class="cm-field-label" aria-hidden="true"></span>
                              <div class="cm-field">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  leadingIcon={Trash2}
                                  ariaLabel="Delete {name}"
                                  dataAttrs={{ 'data-ega-cm-delete': true }}
                                  onclick={() => void deleteItem(item)}>Delete</Button
                                >
                              </div>
                            {/if}
                          </div>
                        </CollapsibleField>
                      </div>
                    {/if}
                  </li>
                {/if}
              {/each}
            </ul>
          </div>
          {#if shown >= LONG_GROUP}
            <p class="cm-note" data-ega-cm-long>
              Long menus are slow to scan. Hide the items you rarely use.
            </p>
          {/if}
          {#if g.add}
            {@const kind = g.add}
            <div class="cm-add">
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={Plus}
                dataAttrs={{
                  [kind === 'task' ? 'data-ega-cm-add' : 'data-ega-cm-add-image']: true,
                  'aria-disabled': full ? 'true' : undefined,
                  'aria-describedby': full ? `cm-full-${g.id}` : undefined,
                }}
                onclick={() => void addItem(kind)}>{g.addLabel}</Button
              >
              {#if full}
                <p class="cm-note" id="cm-full-{g.id}" data-ega-cm-full>
                  Menu is full ({CONTEXT_MENU_ITEMS_MAX} items). Delete one to add another.
                </p>
              {/if}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  </SectionCard>
</div>

<style>
  /* The card's own width decides the narrow layout, wherever the options page is framed. */
  .cm-card {
    container-type: inline-size;
  }
  .cm-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    margin-top: var(--space-2);
  }
  .cm-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .cm-group-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--space-2);
  }
  .cm-group-title {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--color-fg);
  }
  .cm-group-hint,
  .cm-status,
  .cm-hint,
  .cm-note,
  .cm-preview {
    font-size: var(--fs-sm);
    color: var(--color-muted);
    line-height: 1.5;
  }
  .cm-note {
    margin: 0;
  }

  /* The box is drawn like the menu Chrome shows: rows sit on it with no border of their own (R25). */
  .cm-box {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    padding: var(--space-1) 0;
  }
  .cm-preview {
    margin: 0;
    padding: var(--space-1) var(--space-3);
  }

  .cm-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  /* svelte-dnd-action adds an outline to the zone while dragging. */
  .cm-list:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .cm-row {
    padding: var(--space-1) var(--space-2);
  }
  .cm-row.is-open {
    background: var(--color-bg-hover);
  }
  .cm-row-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 32px;
  }

  .cm-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    color: var(--color-muted);
    cursor: grab;
    border-radius: var(--radius-sm);
  }
  .cm-handle:active {
    cursor: grabbing;
  }
  .cm-check {
    display: inline-flex;
    flex: 0 0 auto;
  }
  .cm-check-spacer {
    flex: 0 0 auto;
    width: 16px;
  }
  .cm-check :global(input[aria-disabled='true']) {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .cm-kind {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--color-muted);
  }

  .cm-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .cm-name {
    font-size: var(--fs-base);
    color: var(--color-fg);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .cm-name.is-hidden,
  .cm-name.is-loading {
    color: var(--color-muted);
  }

  .cm-tools {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .cm-tools :global(.ega-icon-btn[aria-disabled='true']) {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .cm-tools :global(.ega-icon-btn[aria-disabled='true']:hover) {
    background: transparent;
    color: var(--color-fg-subtle);
  }
  .cm-tools :global(.ega-btn-label) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* Options start under the name: one indent level that marks them as the row's children (R15). */
  .cm-opts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding-block: var(--space-2) var(--space-3);
    padding-inline-start: calc(24px + 16px + 16px + var(--space-2) * 3);
    padding-inline-end: var(--space-2);
  }
  .cm-field-label {
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-fg);
  }
  .cm-field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    min-width: 0;
  }
  /* One width for every field, so the controls end on one edge (R15). */
  .cm-field :global(.ega-input-wrap),
  .cm-field :global(.ega-select-wrap),
  .cm-field :global(select) {
    width: 100%;
    max-width: 360px;
  }
  /* Labels line up with the first line of their control, not the middle of a control plus its hint. */
  .cm-field-label {
    align-self: start;
    padding-block-start: var(--space-1);
  }
  /* A radio group sits lower in its row than a select, so its label does too. */
  .cm-field-label.is-radio {
    padding-block-start: var(--space-3);
  }

  .cm-row-shadow {
    pointer-events: none;
  }
  .cm-shadow-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    border: 2px dashed var(--color-accent);
    border-radius: var(--radius-md);
    color: var(--color-accent);
    font-size: var(--fs-sm);
  }

  .cm-add {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }
  .cm-add :global(.ega-btn[aria-disabled='true']) {
    cursor: not-allowed;
    opacity: 0.55;
  }

  /* Narrow card: the label sits above its control, and the row actions stay on the name line.
     The kind icon only repeats the group, so it gives its room to the name. */
  @container (max-width: 480px) {
    .cm-opts {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-1);
      padding-inline-start: var(--space-2);
    }
    .cm-field {
      margin-bottom: var(--space-2);
    }
    .cm-field-label,
    .cm-field-label.is-radio {
      padding-block-start: 0;
    }
    .cm-kind {
      display: none;
    }
    .cm-row {
      padding-inline: var(--space-1);
    }
  }
</style>
