<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { resolveChainForTask } from '@/shared/backends/select';
  import { resolveBackend, getRegisteredBackendIds } from '@/shared/backends/registry';
  import { backendHasRequiredKey, backendNeedsKey } from '@/shared/backends/key-presence';
  import Cpu from '@lucide/svelte/icons/cpu';
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

  const chain = $derived(
    resolveChainForTask(
      {
        backendOrder: settings.backendOrder ?? [],
        disabledBackends: settings.disabledBackends ?? [],
        taskBackendChains: settings.advanced.taskBackendChains ?? {},
        taskBackends: settings.taskBackends,
      },
      'translate',
      getRegisteredBackendIds(),
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
    const backend = resolveBackend(resolvedId);
    return backend?.manifest?.name ?? resolvedId;
  });

  const modelLabel = $derived.by(() => {
    if (resolvedId === null) return null;
    const map = settings.model as Record<string, string | undefined>;
    const raw = map[resolvedId];
    if (!raw) return null;
    return raw;
  });

  // Strip the trailing date tail so the model family shows before the chip truncates.
  const modelLabelShort = $derived(
    modelLabel?.replace(/-\d{6,}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '') ?? null,
  );

  function isProbeResult(r: unknown): r is ProbeResult {
    if (r === null || typeof r !== 'object') return false;
    const a = (r as { available?: unknown }).available;
    return a !== null && typeof a === 'object';
  }

  // A probe is one request per backend, so it runs at most once per window and never twice at once.
  const PROBE_TTL_MS = 30_000;
  let probeAt = 0;
  let probing = false;
  async function ensureProbe(): Promise<void> {
    if (probing || (probeLoaded && Date.now() - probeAt < PROBE_TTL_MS)) return;
    probing = true;
    probeLoaded = true;
    try {
      // The SW probes: it already holds the native port, so no second host process starts here.
      const reply = await sendMsg({ kind: 'backend:probe-all' });
      // A reply is data from another context: an old worker or a test double answers a different shape.
      probe = isProbeResult(reply) ? reply : { available: {}, active: null };
    } catch (e) {
      debugCatch(e, 'ActiveBackendChip.ensureProbe');
      // A failed probe must still settle the chip out of "Checking…".
      probe = { available: {}, active: null };
    } finally {
      probeAt = Date.now();
      probing = false;
    }
  }

  function onClick(): void {
    // Only the settled empty state is a jump; the popover has its own "checking" row during a probe.
    if (resolvedId === null && !checking) {
      onJump();
      return;
    }
    // Open first: awaiting the probe would swallow the click until the slowest backend answers. BackendPopover renders its own `probe: null` state.
    popoverOpen = !popoverOpen;
    if (popoverOpen) void ensureProbe();
  }
</script>

<button
  bind:this={chip}
  type="button"
  class="active-backend-chip"
  class:empty={resolvedId === null && !checking}
  class:checking
  aria-label={checking
    ? 'Checking backends'
    : resolvedId === null
      ? 'No backend configured — click to set one up'
      : `Active backend: ${backendName}${modelLabel ? ` (${modelLabel})` : ''} — click for the fallback order`}
  data-tooltip={checking
    ? 'Checking backends…'
    : resolvedId === null
      ? 'No backend configured — open Backends'
      : `Active backend: ${backendName}${modelLabel ? ` (${modelLabel})` : ''} — see the fallback order`}
  data-tooltip-placement="bottom"
  aria-haspopup={resolvedId === null && !checking ? undefined : 'dialog'}
  aria-expanded={popoverOpen}
  onclick={onClick}
>
  <Cpu size={12} strokeWidth={1.75} aria-hidden="true" />
  {#if checking}
    <span class="empty-label">Checking…</span>
  {:else if resolvedId === null}
    <span class="empty-label">No backend — set one up</span>
  {:else}
    <span class="chip-name">{backendName}</span>
    {#if modelLabel}
      <span class="chip-sep" aria-hidden="true">·</span>
      <span class="chip-model">{modelLabelShort}</span>
    {/if}
  {/if}
</button>

{#if resolvedId !== null || popoverOpen}
  <BackendPopover
    open={popoverOpen}
    anchor={chip}
    {probe}
    task="translate"
    taskBackends={settings.taskBackends}
    backendOrder={settings.backendOrder}
    taskBackendChains={settings.advanced.taskBackendChains}
    disabledBackends={settings.disabledBackends}
    {missingKeyIds}
    onManage={onJump}
    onClose={() => (popoverOpen = false)}
  />
{/if}

<style>
  .active-backend-chip {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 28ch;
    padding: 2px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    line-height: 1.4;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }
  .active-backend-chip:hover {
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
  .active-backend-chip:focus-visible {
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    border-color: var(--color-accent);
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .active-backend-chip[aria-expanded='true'] {
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
  .active-backend-chip:hover .chip-model,
  .active-backend-chip:hover .chip-sep,
  .active-backend-chip:focus-visible .chip-model,
  .active-backend-chip:focus-visible .chip-sep,
  .active-backend-chip[aria-expanded='true'] .chip-model,
  .active-backend-chip[aria-expanded='true'] .chip-sep {
    color: inherit;
  }
  .active-backend-chip.checking {
    color: var(--color-muted);
  }
  .active-backend-chip.empty {
    color: var(--color-muted);
    border-style: dashed;
  }
  .chip-name {
    font-weight: 500;
  }
  /* A parent that squeezes the chip truncates the label, never the icon. */
  .chip-name,
  .empty-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .active-backend-chip :global(svg) {
    flex-shrink: 0;
  }
  .chip-sep {
    color: var(--color-muted);
  }
  .chip-model {
    color: var(--color-muted);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .empty-label {
    font-style: italic;
  }
</style>
