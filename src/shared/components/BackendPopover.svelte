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
    /** Turned-off backends, left out of the list. */
    disabledBackends: readonly BackendId[];
    /** Backends missing their required API key: "Needs a key", not "Can't connect". */
    missingKeyIds?: readonly BackendId[];
    /** Manage backends and every row fix: the consumer opens Options → Backends. */
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

  // Popover returns focus to the chip on Esc and leaves it where an outside click put it.
  function handleClose(): void {
    onClose();
  }

  // The router's chain without probing; turned-off backends are left out (Options lists them).
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

  type RowStatus = 'in-use' | 'ready' | 'no-key' | 'not-running' | 'cant-connect' | 'checking';

  function rowStatus(id: BackendId): RowStatus {
    if (id === activeId) return 'in-use';
    // A missing key is a to-do, not a failure.
    if (missingKeyIds.includes(id)) return 'no-key';
    if (!probe) return 'checking';
    if (probe.available[id]) return 'ready';
    return backendNeedsKey(id) ? 'cant-connect' : 'not-running';
  }

  const STATUS_TEXT: Record<RowStatus, string> = {
    'in-use': 'In use',
    ready: 'Ready',
    'no-key': 'Needs a key',
    'not-running': 'Not running',
    'cant-connect': "Can't connect",
    checking: 'Checking…',
  };

  /** The one fix a row that is not ready offers; each opens Options → Backends. */
  const FIX_TEXT: Partial<Record<RowStatus, string>> = {
    'no-key': 'Add key',
    'not-running': 'How to start',
    'cant-connect': 'Check settings',
  };

  function dotState(status: RowStatus): 'on' | 'off' | 'idle' {
    if (status === 'in-use' || status === 'ready') return 'on';
    return status === 'checking' ? 'idle' : 'off';
  }
</script>

{#if anchor}
  <Popover {open} {anchor} onClose={handleClose} placement="bottom-end" title="Backends">
    <div class="backend-detail">
      <p class="chain-help">Ega tries them in this order.</p>
      <ol class="chain-list" aria-live="polite">
        {#each chainIds as id, i (id)}
          {@const status = rowStatus(id)}
          {@const fix = FIX_TEXT[status]}
          <li class="chain-row" data-ega-backend-row={id}>
            <span class="chain-pos" aria-hidden="true">{i + 1}.</span>
            <span class="dot {dotState(status)}" aria-hidden="true"></span>
            <span class="chain-text">
              <span class="chain-label">{backendLabel(id)}</span>
              <span class="chain-status">{STATUS_TEXT[status]}</span>
            </span>
            {#if fix !== undefined}
              <button
                type="button"
                class="setup-btn"
                aria-label={`${fix}: ${backendLabel(id)}`}
                onclick={onManageClick}>{fix}</button
              >
            {/if}
          </li>
        {/each}
      </ol>
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
    gap: var(--space-2);
    inline-size: min(280px, calc(100vw - 48px));
    max-block-size: calc(100vh - 96px);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
  }
  .chain-list {
    overflow-y: auto;
    min-block-size: 0;
  }
  /* No inline padding here or on rows: the text lines up with the popover title (R15). */
  .chain-help {
    margin: 0;
    color: var(--color-muted);
  }
  .chain-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .chain-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding-block: var(--space-1);
  }
  .chain-pos {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
    min-inline-size: 1.25em;
  }
  /* Names wrap: a long backend name is never cut. */
  .chain-text {
    flex: 1 1 auto;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
  }
  .chain-label {
    color: var(--color-fg);
  }
  .chain-status {
    color: var(--color-muted);
  }
  .dot {
    inline-size: 8px;
    block-size: 8px;
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
  .footer-row {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid var(--color-border-subtle);
    padding-top: var(--space-2);
  }
  /* Every pointer target in the panel is 28px tall (spec §9.2), these text buttons included. */
  .setup-btn {
    appearance: none;
    flex-shrink: 0;
    min-block-size: 28px;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-accent);
    font-size: var(--fs-sm);
    font-family: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .setup-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  @media (forced-colors: active) {
    .dot {
      border: 1px solid CanvasText;
    }
  }
</style>
