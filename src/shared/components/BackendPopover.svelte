<script lang="ts">
  import Popover from '@/shared/ui/Popover.svelte';
  import type { BackendId } from '@/shared/types';
  import type { ProbeResult } from '@/shared/translate-ui';
  import { computeBackendOrder } from '@/shared/backends/select';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { backendNeedsKey } from '@/shared/backends/key-presence';

  interface Props {
    open: boolean;
    /** Anchor element for the popover. Consumer wires this up via a
     *  callback ref on the trigger. */
    anchor: HTMLElement | null;
    /** Latest probe — null while probing for the first time. */
    probe: ProbeResult | null;
    /** Current backend order (fallback chain). */
    backendOrder: readonly BackendId[];
    /** Disabled backends — counted under the chain, not listed. */
    disabledBackends: readonly BackendId[];
    /** Backends missing their required API key — badged "no key" instead
     *  of "error". Absent ⇒ every unreachable backend reads as error. */
    missingKeyIds?: readonly BackendId[];
    /** "Manage chain" footer click — consumer opens Options → Backends. */
    onManage: () => void;
    /** Close handler — Escape, click-outside, or after Manage. */
    onClose: () => void;
  }

  let {
    open,
    anchor,
    probe,
    backendOrder,
    disabledBackends,
    onManage,
    onClose,
    missingKeyIds = [],
  }: Props = $props();

  // preventScroll stops the page jumping when the trigger sits mid-viewport.
  function handleClose(): void {
    onClose();
    anchor?.focus({ preventScroll: true });
  }

  // The router's chain without probing; it drops disabled ids, which the rows re-add below.
  const chainIds = $derived<readonly BackendId[]>(
    computeBackendOrder({ backendOrder, disabledBackends }),
  );

  const activeId = $derived.by<BackendId | null>(() => {
    const p = probe;
    if (!p) return null;
    for (const id of chainIds) {
      if (p.available[id]) return id;
    }
    return null;
  });

  function onManageClick(): void {
    onManage();
    handleClose();
  }

  function chainRowDotState(id: BackendId): 'on' | 'off' | 'idle' {
    if (!probe) return 'idle';
    if (probe.available[id]) return 'on';
    return 'off';
  }

  function chainBadge(id: BackendId): 'active' | 'error' | 'no-key' | 'not-running' | null {
    if (id === activeId) return 'active';
    // A missing key is a to-do, not a failure — badge it neutrally.
    if (missingKeyIds.includes(id)) return 'no-key';
    if (probe && probe.available[id] === false) {
      return backendNeedsKey(id) ? 'error' : 'not-running';
    }
    return null;
  }

  // The dot and badge carry state by color alone, so the row label has to name the resolved state.
  function chainRowLabel(id: BackendId): string {
    const name = backendLabel(id);
    const badge = chainBadge(id);
    if (badge === 'active') return `${name}, active`;
    if (badge === 'no-key') return `${name}, no API key`;
    if (badge === 'not-running') return `${name}, not running`;
    if (badge === 'error') return `${name}, unreachable`;
    if (!probe) return `${name}, checking`;
    return name;
  }

  // computeBackendOrder already dropped these; they are counted, not listed, so the order stays readable.
  const disabledInChain = $derived.by(() => {
    const out: BackendId[] = [];
    for (const id of backendOrder) {
      if (!disabledBackends.includes(id)) continue;
      if (chainIds.includes(id) || out.includes(id)) continue;
      out.push(id);
    }
    return out;
  });
</script>

{#if anchor}
  <Popover {open} {anchor} onClose={handleClose} placement="bottom-end" title="Backends" scrim>
    <div class="backend-detail">
      <section class="chain-section">
        {#if probe === null}
          <div class="backend-active-empty">Checking backends…</div>
        {:else if !probe.active}
          <div class="backend-active-empty">
            No backend ready.
            <button type="button" class="setup-btn" onclick={onManageClick}>Set up backends</button>
          </div>
        {/if}
        <p class="chain-help">Ega tries them in this order.</p>
        <ol class="chain-list" aria-live="polite">
          {#each chainIds as id, i (id)}
            {@const badge = chainBadge(id)}
            <li class="chain-row" aria-label={chainRowLabel(id)}>
              <span class="chain-pos">{i + 1}.</span>
              <span class="dot {chainRowDotState(id)}" aria-hidden="true"></span>
              <span class="chain-label">{backendLabel(id)}</span>
              {#if badge === 'active'}
                <span class="badge badge-active">active</span>
              {:else if badge === 'no-key'}
                <span class="badge badge-muted">no key</span>
                <button
                  type="button"
                  class="setup-btn"
                  aria-label={`Set up ${backendLabel(id)}`}
                  onclick={onManageClick}>Set up</button
                >
              {:else if badge === 'not-running'}
                <span class="badge badge-muted">not running</span>
              {:else if badge === 'error'}
                <span class="badge badge-error">error</span>
              {/if}
            </li>
          {/each}
        </ol>
        {#if disabledInChain.length > 0}
          <p class="chain-off">
            {disabledInChain.length}
            {disabledInChain.length === 1 ? 'backend is' : 'backends are'} turned off.
            <button type="button" class="setup-btn" onclick={onManageClick}>Manage</button>
          </p>
        {/if}
      </section>

      <div class="footer-row">
        <button type="button" class="setup-btn" data-ega-manage-chain onclick={onManageClick}
          >Manage backends</button
        >
      </div>
    </div>
  </Popover>
{/if}

<style>
  .backend-detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 240px;
    max-width: 280px;
    font-size: var(--fs-sm);
  }
  .chain-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .chain-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 2px var(--space-1);
    border-radius: var(--radius-sm);
    line-height: 1.4;
  }
  .chain-help {
    margin: 0 0 var(--space-1);
    padding: 0 var(--space-1);
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  .chain-off {
    margin: var(--space-1) 0 0;
    padding: 0 var(--space-1);
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  .chain-pos {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
    min-width: 1.25em;
  }
  .chain-label {
    /* min-width:0 lets a long manifest name ellipsize instead of wrapping the badge onto its own line. */
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
    display: inline-block;
    background: var(--color-dot-neutral);
    flex-shrink: 0;
  }
  .dot.on {
    background: var(--color-dot-on);
  }
  .dot.off {
    background: var(--color-dot-off);
  }
  .badge {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .badge-active {
    /* accent lands under 4.5:1 on the soft accent tint; accent-hover clears it in both themes. */
    color: var(--color-accent-hover);
    background: var(--color-accent-bg-soft);
  }
  .badge-error {
    color: var(--color-danger-fg);
    background: var(--color-danger-bg-soft);
  }
  .badge-muted {
    color: var(--color-muted);
    background: var(--color-bg-sunken);
  }
  .footer-row {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid var(--color-border-subtle);
    padding-top: var(--space-2);
  }
  .backend-active-empty {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
    margin-bottom: var(--space-1);
    color: var(--color-muted);
    font-size: var(--fs-xs);
    background: var(--color-bg-sunken);
    border-radius: var(--radius-sm);
  }
  .setup-btn {
    appearance: none;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-family: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .setup-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
