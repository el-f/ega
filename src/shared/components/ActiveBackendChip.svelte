<script lang="ts">
  import { untrack } from 'svelte';
  import type { Settings } from '@/shared/types';
  import { computeBackendOrder } from '@/shared/backends/select';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { BACKEND_IDS } from '@/shared/provider-ids';
  import { asBackendIdUnsafe } from '@/shared/brands';
  import { backendHasRequiredKey, backendNeedsKey } from '@/shared/backends/key-presence';
  import BackendPopover from '@/shared/components/BackendPopover.svelte';
  import type { ProbeResult } from '@/shared/translate-ui';
  import { sendMsg } from '@/shared/messages';
  import { debugCatch } from '@/shared/logger';

  interface Props {
    settings: Settings;
    /** Jump to Options → Backends. */
    onJump: () => void;
    /** Readiness of the resolved chain; null while the probe still decides. Saves a second probe. */
    onReadyChange?: (ready: boolean | null) => void;
  }

  const { settings, onJump, onReadyChange }: Props = $props();

  let chip: HTMLButtonElement | null = $state(null);
  let popoverOpen = $state(false);
  let probe = $state<ProbeResult | null>(null);
  let probeLoaded = $state(false);

  const KNOWN_BACKEND_IDS = BACKEND_IDS.map(asBackendIdUnsafe);

  const chain = $derived(
    computeBackendOrder(
      {
        backendOrder: settings.backendOrder ?? [],
        disabledBackends: settings.disabledBackends ?? [],
      },
      KNOWN_BACKEND_IDS,
    ),
  );

  // Key presence readies a cloud backend; a key-less backend (native, ollama) counts only once the probe saw it reachable.
  const resolvedId = $derived.by(() => {
    for (const id of chain) {
      if (backendNeedsKey(id)) {
        if (backendHasRequiredKey(id, settings)) return id;
      } else if (probe?.available[id] === true) {
        return id;
      }
    }
    return null;
  });

  // True when a key-less backend sits ahead of every keyed-and-ready one, so reachability decides the name.
  const probeDecides = $derived.by(() => {
    for (const id of chain) {
      if (!backendNeedsKey(id)) return true;
      if (backendHasRequiredKey(id, settings)) return false;
    }
    return false;
  });

  const checking = $derived(resolvedId === null && probeDecides && probe === null);

  $effect(() => {
    const ready = checking ? null : resolvedId !== null;
    onReadyChange?.(ready);
  });

  const missingKeyIds = $derived(
    chain.filter((id) => backendNeedsKey(id) && !backendHasRequiredKey(id, settings)),
  );

  $effect(() => {
    if (probeDecides) void ensureProbe();
  });
  $effect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && probeDecides) void ensureProbe();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  const backendName = $derived.by(() => {
    if (resolvedId === null) return null;
    return backendLabel(resolvedId);
  });

  // One sentence for the name and the hover label, so the collapsed dot button says what the chip said.
  const chipName = $derived(
    checking
      ? 'Checking backends'
      : backendName === null
        ? 'Set up backend. No backend is ready yet'
        : `${backendName} is ready. Show backends`,
  );
  // With no backend the chip opens Options in a tab: nothing expands, so it claims no popup.
  const opensPopover = $derived(resolvedId !== null || checking);

  function isProbeResult(r: unknown): r is ProbeResult {
    if (r === null || typeof r !== 'object') return false;
    const a = (r as { available?: unknown }).available;
    return a !== null && typeof a === 'object';
  }

  // A probe answers for one chain and one pair of server URLs; a change makes it stale at once.
  const probeKey = $derived(
    JSON.stringify([
      settings.backendOrder,
      settings.disabledBackends,
      settings.ollamaUrl,
      settings.localServerUrl,
    ]),
  );
  let probeGen = 0;
  let lastProbeKey: string | undefined;
  $effect(() => {
    const key = probeKey;
    if (lastProbeKey !== undefined && key !== lastProbeKey) {
      probeGen++;
      probe = null;
      probeLoaded = false;
      // Called here: the probe effect no longer tracks probeLoaded once a probe has started.
      untrack(() => {
        if (probeDecides || popoverOpen) void ensureProbe();
      });
    }
    lastProbeKey = key;
  });

  // A probe is one request per backend, so it runs at most once per window and never twice at once.
  const PROBE_TTL_MS = 30_000;
  let probeAt = 0;
  let probing = false;
  async function ensureProbe(): Promise<void> {
    if (probing || (probeLoaded && Date.now() - probeAt < PROBE_TTL_MS)) return;
    probing = true;
    probeLoaded = true;
    const gen = probeGen;
    let result: ProbeResult;
    try {
      // The SW probes: it already holds the native port, so no second host process starts here.
      const reply = await sendMsg({ kind: 'backend:probe-all' });
      // A reply is data from another context: an old worker or a test double answers a different shape.
      result = isProbeResult(reply) ? reply : { available: {}, active: null };
    } catch (e) {
      debugCatch(e, 'ActiveBackendChip.ensureProbe');
      // A failed probe must still settle the chip out of "Checking…".
      result = { available: {}, active: null };
    } finally {
      probeAt = Date.now();
      probing = false;
    }
    if (gen === probeGen) probe = result;
    else if (probeDecides || popoverOpen) void ensureProbe();
  }

  function onClick(): void {
    // Only the settled empty state is a jump; the popover has its own "checking" row during a probe.
    if (!opensPopover) {
      onJump();
      return;
    }
    // Open first: awaiting the probe would swallow the click until the slowest backend answers. BackendPopover renders its own `probe: null` state.
    popoverOpen = !popoverOpen;
    if (popoverOpen) void ensureProbe();
  }
</script>

<!-- Never truncated: the name fits, or under 360px of header the chip becomes its dot, named in full. -->
<button
  bind:this={chip}
  type="button"
  class="active-backend-chip"
  class:empty={!opensPopover}
  class:checking
  aria-label={chipName}
  data-tooltip={chipName}
  data-tooltip-placement="bottom"
  data-ega-backend-chip
  aria-haspopup={opensPopover ? 'dialog' : undefined}
  aria-expanded={opensPopover ? popoverOpen : undefined}
  onclick={onClick}
>
  {#if !opensPopover}
    <span class="chip-name">Set up backend</span>
  {:else}
    <span class="chip-dot" class:on={!checking} aria-hidden="true"></span>
    <span class="chip-name">{checking ? 'Checking' : backendName}</span>
  {/if}
</button>

{#if resolvedId !== null || popoverOpen}
  <BackendPopover
    open={popoverOpen}
    anchor={chip}
    {probe}
    backendOrder={settings.backendOrder}
    disabledBackends={settings.disabledBackends}
    {missingKeyIds}
    onManage={onJump}
    onClose={() => (popoverOpen = false)}
  />
{/if}

<style>
  .active-backend-chip {
    appearance: none;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    box-sizing: border-box;
    block-size: 28px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    font-weight: 400;
    line-height: var(--lh-body);
    white-space: nowrap;
    cursor: pointer;
  }
  .active-backend-chip:hover,
  .active-backend-chip[aria-expanded='true'] {
    background: var(--color-bg-hover);
  }
  .active-backend-chip:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  /* Open, the chip has said what it does; its hover label would sit on the popover (the popup has no panel rule). */
  .active-backend-chip[aria-expanded='true']:hover::after,
  .active-backend-chip[aria-expanded='true']:focus-visible::after {
    content: none;
  }
  .active-backend-chip.empty {
    color: var(--color-warning-fg);
    border-style: dashed;
  }
  .chip-dot {
    flex-shrink: 0;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--radius-pill);
    background: var(--color-warning);
  }
  .chip-dot.on {
    background: var(--color-dot-on);
  }
  /* The header names itself `ega-header`; a header narrower than 360px keeps only the dot. Set up backend never collapses. */
  @container ega-header (max-width: 359px) {
    .active-backend-chip:not(.empty) {
      inline-size: 28px;
      padding: 0;
      justify-content: center;
    }
    .active-backend-chip:not(.empty) .chip-name {
      display: none;
    }
  }
  @media (forced-colors: active) {
    .chip-dot {
      border: 1px solid CanvasText;
    }
  }
</style>
