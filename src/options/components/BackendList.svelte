<script lang="ts">
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
  import type { Snippet } from 'svelte';
  import type { Settings, BackendId } from '@/shared/types';
  import { isShadowRow } from '@/shared/dnd-shadow-row';
  import { useShadowSync } from '@/shared/svelte/useShadowSync.svelte';
  import BackendListAria from './BackendListAria.svelte';
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    settings: Settings;
    /** One write for both lists: a drag into the disabled zone changes order and disabled together. */
    onChange: (next: {
      backendOrder: BackendId[];
      disabledBackends: BackendId[];
    }) => void | Promise<void>;
    children?: Snippet<
      [id: BackendId, position: number | null, enabled: boolean, useSummary: typeof dragHandle]
    >;
  }
  let { settings, onChange, children }: Props = $props();

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

  function endDrag(): void {
    dragging = false;
    window.getSelection()?.removeAllRanges();
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

  function setEnabled(id: BackendId, enabled: boolean): void {
    const current = settings.disabledBackends ?? [];
    const disabled = enabled ? current.filter((b) => b !== id) : [...current, id];
    if (settings.backendOrder.every((b) => disabled.includes(b))) {
      announcement = 'At least one backend must stay enabled';
      return;
    }
    announcement = `${id} ${enabled ? 'enabled' : 'disabled'}`;
    onChange({
      backendOrder: [...settings.backendOrder],
      disabledBackends: settings.backendOrder.filter((b) => disabled.includes(b)),
    });
  }

  function handleEnabledConsider(e: CustomEvent<{ items: Row[] }>): void {
    dragging = true;
    enabledShadow.items = e.detail.items;
  }

  function handleDisabledConsider(e: CustomEvent<{ items: Row[] }>): void {
    dragging = true;
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
</script>

<section class="be-list" class:be-dragging={dragging} data-testid="be-list">
  <header class="be-section-head be-section-head-active">
    <h4 class="be-section-title">Active backends</h4>
    <p class="be-section-help">
      Listed in fallback order. Drag the ⋮⋮ handle to reorder. Press Disable to take one out of the
      fallback order.
    </p>
  </header>
  <div
    role="list"
    aria-label="Active backends, drag to reorder, drag below the divider to disable"
    data-testid="be-list-active"
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
          <div class="be-shadow-slot" aria-hidden="true">Drop here</div>
        {:else}
          {@render children?.(row.id, i + 1, true, dragHandle)}
          <span class="be-toggle">
            <Button
              variant="ghost"
              size="sm"
              ariaLabel="Disable {row.id}"
              onclick={() => setEnabled(row.id, false)}>Disable</Button
            >
          </span>
        {/if}
      </div>
    {/each}
  </div>

  <header class="be-section-head be-section-head-available">
    <h4 class="be-section-title">Available backends</h4>
    <p class="be-section-help">
      Not in the fallback order. Press Enable to add one, or drag it above the divider.
    </p>
  </header>

  <div
    role="list"
    aria-label="Available backends, drag above the divider to enable"
    data-testid="be-list-available"
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
          <div class="be-shadow-slot" aria-hidden="true">Drop here</div>
        {:else}
          {@render children?.(row.id, null, false, dragHandle)}
          <span class="be-toggle">
            <Button
              variant="secondary"
              size="sm"
              ariaLabel="Enable {row.id}"
              onclick={() => setEnabled(row.id, true)}>Enable</Button
            >
          </span>
        {/if}
      </div>
    {/each}
  </div>

  <BackendListAria message={announcement} />
</section>

<style>
  /* user-select inherits, so one rule covers every card while a drag is live. */
  .be-dragging {
    user-select: none;
  }
  .be-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .be-row > :global(:first-child) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .be-toggle {
    flex: 0 0 auto;
    padding-top: 10px;
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
    font-size: var(--fs-sm);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .be-section-head {
    margin: 0 0 var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .be-section-head-available {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px dashed var(--color-border);
  }
  .be-section-title {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-fg);
    letter-spacing: 0.02em;
  }
  .be-section-help {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: 1.4;
  }
</style>
