<script lang="ts">
  import { dragHandleZone, dragHandle, DRAGGED_ELEMENT_ID, TRIGGERS } from 'svelte-dnd-action';
  import { tick, type Snippet } from 'svelte';
  import type { Settings, BackendId } from '@/shared/types';
  import { isShadowRow } from '@/shared/dnd-shadow-row';
  import { useShadowSync } from '@/shared/svelte/useShadowSync.svelte';
  import BackendListAria from './BackendListAria.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ServerOff from '@lucide/svelte/icons/server-off';
  import { backendLabel } from '@/shared/backends/provider-profiles';

  interface Props {
    settings: Settings;
    /** One write for both lists: a drag into the disabled zone changes order and disabled together. */
    onChange: (next: { backendOrder: BackendId[]; disabledBackends: BackendId[] }) => unknown;
    children?: Snippet<
      [id: BackendId, position: number | null, enabled: boolean, useSummary: typeof dragHandle]
    >;
    /** Moves an active backend one slot up (-1) or down (1); the buttons are the non-drag way to reorder. */
    onMove?: (id: BackendId, delta: -1 | 1) => unknown;
    /** Rows above the in-use list: the "Try up to" control and its line. */
    inUseHeader?: Snippet;
  }
  let { settings, onChange, children, onMove, inUseHeader }: Props = $props();

  let listEl: HTMLElement | undefined = $state();
  function focusRowButton(id: BackendId, ariaLabel: string): void {
    listEl
      ?.querySelector<HTMLElement>(`[data-testid="be-row-${id}"] [aria-label="${ariaLabel}"]`)
      ?.focus();
  }

  // A move re-renders the row (down detaches it) and can disable the pressed arrow, so focus is put back by hand.
  async function move(id: BackendId, delta: -1 | 1, from: number): Promise<void> {
    // onMove resolves false when the write did not land; the failure toast says why.
    const ok = await onMove?.(id, delta);
    announcement =
      ok === false
        ? `${backendLabel(id)} was not moved`
        : `${backendLabel(id)} moved to position ${from + delta + 1}`;
    await tick();
    const at = enabledShadow.items.findIndex((r) => r.id === id);
    const atEnd = delta === -1 ? at === 0 : at === enabledShadow.items.length - 1;
    // At an end the pressed arrow is disabled and cannot hold focus, so the other arrow takes it.
    const up = delta === -1 ? !atEnd : atEnd;
    focusRowButton(id, `Move ${backendLabel(id)} ${up ? 'up' : 'down'}`);
  }

  // Ids of cards the user has open: Enable and Disable remount a card in the other list, and it must not snap shut.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read only when a card remounts, never rendered.
  const openIds = new Set<string>();
  function trackOpen(e: Event): void {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset['backendId']) return;
    if (d.open) openIds.add(d.dataset['backendId']);
    else openIds.delete(d.dataset['backendId']);
  }

  type Row = { id: BackendId };
  // svelte-dnd-action mutates its items array mid-drag; mirror every consider/finalize back or rows vanish.
  const enabledShadow = useShadowSync<Row>({
    seed: () =>
      settings.backendOrder
        .filter((id) => !(settings.disabledBackends ?? []).includes(id))
        .map((id) => ({ id })),
    keyOf: (xs) => xs.map((r) => r.id).join('|'),
  });
  const disabledShadow = useShadowSync<Row>({
    seed: () =>
      settings.backendOrder
        .filter((id) => (settings.disabledBackends ?? []).includes(id))
        .map((id) => ({ id })),
    keyOf: (xs) => xs.map((r) => r.id).join('|'),
  });

  let announcement = $state<string>('');
  // Suppresses text selection while a drag is live; the browser otherwise paints a selection smear across the cards.
  let dragging = $state(false);

  // The drop slot keeps the dragged card's height: a short slot pulls the next card up under the cursor, and the drop lands below it.
  let slotHeight = $state<number | null>(null);

  function endDrag(): void {
    dragging = false;
    slotHeight = null;
    window.getSelection()?.removeAllRanges();
  }

  function startDrag(e: CustomEvent<{ info: { trigger: string } }>): void {
    dragging = true;
    if (e.detail.info.trigger !== TRIGGERS.DRAG_STARTED) return;
    slotHeight =
      document.getElementById(DRAGGED_ELEMENT_ID)?.getBoundingClientRect().height ?? null;
  }

  function recomposeOrder(nextEnabled: Row[], nextDisabled: Row[]): BackendId[] {
    return [...nextEnabled.map((r) => r.id), ...nextDisabled.map((r) => r.id)];
  }
  // Both zones stage here; commitPending writes once both halves have landed, so one drag commits once.
  let pendingEnabled: Row[] | null = null;
  let pendingDisabled: Row[] | null = null;

  function commitPending(): void {
    const nextEnabled = pendingEnabled;
    const nextDisabled = pendingDisabled;
    if (nextEnabled === null || nextDisabled === null) return;

    const allIds = new Set([...nextEnabled.map((r) => r.id), ...nextDisabled.map((r) => r.id)]);
    const expectedIds = new Set(settings.backendOrder);
    for (const id of expectedIds) {
      if (!allIds.has(id)) return; // missing — stale event, skip
    }
    if (allIds.size !== expectedIds.size) return; // duplicate — skip

    pendingEnabled = null;
    pendingDisabled = null;
    onChange({
      backendOrder: recomposeOrder(nextEnabled, nextDisabled),
      disabledBackends: nextDisabled.map((r) => r.id),
    });
  }

  // The storage writer refuses an all-off chain, so the last backend in use cannot leave.
  function setEnabled(id: BackendId, enabled: boolean): void {
    const current = settings.disabledBackends ?? [];
    const disabled = enabled ? current.filter((b) => b !== id) : [...current, id];
    if (settings.backendOrder.every((b) => disabled.includes(b))) {
      announcement = 'At least one backend must stay enabled';
      return;
    }
    announcement = `${backendLabel(id)} ${enabled ? 'enabled' : 'disabled'}`;
    void (async () => {
      await onChange({
        backendOrder: [...settings.backendOrder],
        disabledBackends: settings.backendOrder.filter((b) => disabled.includes(b)),
      });
      await tick();
      // A just-enabled backend opens so its setup is in view; a disabled one keeps the state it had.
      const card = listEl?.querySelector<HTMLDetailsElement>(`details[data-backend-id="${id}"]`);
      if (card && (enabled || openIds.has(id))) card.open = true;
      // The pressed button left with the old row; the moved row's own toggle takes focus.
      focusRowButton(id, `${enabled ? 'Disable' : 'Enable'} ${backendLabel(id)}`);
    })();
  }

  function handleEnabledConsider(
    e: CustomEvent<{ items: Row[]; info: { trigger: string } }>,
  ): void {
    startDrag(e);
    enabledShadow.items = e.detail.items;
  }

  function handleDisabledConsider(
    e: CustomEvent<{ items: Row[]; info: { trigger: string } }>,
  ): void {
    startDrag(e);
    disabledShadow.items = e.detail.items;
  }

  function handleEnabledFinalize(e: CustomEvent<{ items: Row[] }>): void {
    endDrag();
    const finalized = e.detail.items.filter((r) => !isShadowRow(r));
    enabledShadow.items = finalized;
    if (finalized.length === 0) {
      announcement = 'At least one backend must stay enabled';
      pendingEnabled = null;
      pendingDisabled = null;
      return;
    }
    pendingEnabled = finalized;
    // Seed the other half so an intra-zone drag still commits; it may still hold a hover placeholder.
    if (pendingDisabled === null)
      pendingDisabled = disabledShadow.items.filter((r) => !isShadowRow(r));
    commitPending();
  }

  function handleDisabledFinalize(e: CustomEvent<{ items: Row[] }>): void {
    endDrag();
    const finalized = e.detail.items.filter((r) => !isShadowRow(r));
    disabledShadow.items = finalized;
    const remaining = settings.backendOrder.length - finalized.length;
    if (remaining === 0) {
      announcement = 'At least one backend must stay enabled';
      pendingEnabled = null;
      pendingDisabled = null;
      return;
    }
    pendingDisabled = finalized;
    // Seed enabled side for intra-zone drags in the disabled zone.
    if (pendingEnabled === null)
      pendingEnabled = enabledShadow.items.filter((r) => !isShadowRow(r));
    commitPending();
  }
  // One Tab stop per toolbar: arrows move between its buttons, skipping a disabled one (it cannot take focus).
  function toolbarKeys(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End')
      return;
    const bar = e.currentTarget as HTMLElement;
    const items = [...bar.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.disabled);
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : (at + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    for (const b of items) b.tabIndex = -1;
    const target = items[next];
    if (target) {
      target.tabIndex = 0;
      target.focus();
    }
  }
  // The roving stop must sit on an enabled button: the first one that can take focus.
  function rovingStop(node: HTMLElement): void {
    const items = [...node.querySelectorAll<HTMLButtonElement>('button')];
    const first = items.find((b) => !b.disabled);
    for (const b of items) b.tabIndex = b === first ? 0 : -1;
  }
</script>

<div
  class="be-list"
  class:be-dragging={dragging}
  data-testid="be-list"
  bind:this={listEl}
  ontogglecapture={trackOpen}
>
  <SectionCard
    title="Backends in use"
    info={{
      label: 'About the order',
      text: 'Ega asks the first ready backend and, if it fails, the next ready one. Backends that are not set up or not running are skipped.',
    }}
  >
    {#if inUseHeader}{@render inUseHeader()}{/if}
    {#if settings.backendOrder.every((id) => (settings.disabledBackends ?? []).includes(id))}
      <EmptyState
        title="No backend in use"
        description="Press Enable on a backend below"
        icon={ServerOff}
      />
    {/if}
    <div
      class="be-rows"
      role="list"
      aria-label="Backends in use, in the order Ega tries them; drag a row to the list below to stop using it"
      data-testid="be-list-active"
      data-ega-setting="backends.backendOrder"
      use:dragHandleZone={{ items: enabledShadow.items, dragDisabled: false, flipDurationMs: 180 }}
      onconsider={handleEnabledConsider}
      onfinalize={handleEnabledFinalize}
    >
      {#each enabledShadow.items as row, i (row.id)}
        <div
          class="be-row"
          class:is-shadow={isShadowRow(row)}
          data-testid="be-row-{row.id}"
          role="listitem"
        >
          {#if isShadowRow(row)}
            <div
              class="be-shadow-slot"
              aria-hidden="true"
              style:min-height={slotHeight === null ? undefined : `${slotHeight}px`}
            >
              Drop here
            </div>
          {:else}
            {@render children?.(row.id, i + 1, true, dragHandle)}
            {#key `${i}/${enabledShadow.items.length}`}
              <span
                class="be-toggle"
                role="toolbar"
                aria-label="{backendLabel(row.id)} order"
                tabindex="-1"
                use:rovingStop
                onkeydown={toolbarKeys}
              >
                {#if onMove}
                  <IconButton
                    icon={ArrowUp}
                    ariaLabel="Move {backendLabel(row.id)} up"
                    size="sm"
                    disabled={i === 0}
                    onclick={() => void move(row.id, -1, i)}
                  />
                  <IconButton
                    icon={ArrowDown}
                    ariaLabel="Move {backendLabel(row.id)} down"
                    size="sm"
                    disabled={i === enabledShadow.items.length - 1}
                    onclick={() => void move(row.id, 1, i)}
                  />
                {/if}
                <Button
                  variant="secondary"
                  size="sm"
                  ariaLabel="Disable {backendLabel(row.id)}"
                  onclick={() => setEnabled(row.id, false)}>Disable</Button
                >
              </span>
            {/key}
          {/if}
        </div>
      {/each}
    </div>
  </SectionCard>

  <SectionCard title="Not in use" description="Ega never sends text to these">
    <div
      class="be-rows"
      role="list"
      aria-label="Backends not in use; drag a row to the list above to use it"
      data-testid="be-list-available"
      data-ega-setting="backends.disabledBackends"
      use:dragHandleZone={{ items: disabledShadow.items, dragDisabled: false, flipDurationMs: 180 }}
      onconsider={handleDisabledConsider}
      onfinalize={handleDisabledFinalize}
    >
      {#each disabledShadow.items as row (row.id)}
        <div
          class="be-row"
          class:is-shadow={isShadowRow(row)}
          data-testid="be-row-{row.id}"
          role="listitem"
        >
          {#if isShadowRow(row)}
            <div
              class="be-shadow-slot"
              aria-hidden="true"
              style:min-height={slotHeight === null ? undefined : `${slotHeight}px`}
            >
              Drop here
            </div>
          {:else}
            {@render children?.(row.id, null, false, dragHandle)}
            <span class="be-toggle">
              <Button
                variant="secondary"
                size="sm"
                ariaLabel="Enable {backendLabel(row.id)}"
                onclick={() => setEnabled(row.id, true)}>Enable</Button
              >
            </span>
          {/if}
        </div>
      {/each}
    </div>
  </SectionCard>

  <BackendListAria message={announcement} />
</div>

<style>
  /* user-select inherits, so one rule covers every card while a drag is live. */
  .be-dragging {
    user-select: none;
  }
  .be-rows {
    display: flex;
    flex-direction: column;
    min-height: 8px;
  }
  /* Rows are separated by a hairline, never a box per row: text sits inside the card's border only. */
  .be-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .be-row + .be-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .be-row > :global(:first-child) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .be-toggle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 44px;
  }
  /* svelte-dnd-action injects this row at the slot the dragged card will land in. */
  .be-row.is-shadow {
    pointer-events: none;
  }
  .be-shadow-slot {
    flex: 1 1 auto;
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--color-accent);
    border-radius: var(--radius-md);
    background: var(--color-accent-bg-soft, var(--color-bg-elevated));
    color: var(--color-accent);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
  }
</style>
