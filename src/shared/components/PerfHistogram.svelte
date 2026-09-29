<script lang="ts">
  import { onMount } from 'svelte';
  import { computePercentiles, PERF_BUFFER_MAX, type PerfEntry } from '@/shared/perf-history';
  import { sendMsg } from '@/shared/messages';

  // The buffer lives in the service worker's module instance — ask it, never read the local copy.
  let entries = $state<readonly PerfEntry[]>([]);

  onMount(() => {
    let cancelled = false;
    void (async () => {
      try {
        const reply = await sendMsg({ kind: 'perf:entries' });
        // A worker from an older build answers without `entries`; keep the empty state rather than crash the pane.
        if (!cancelled) entries = reply?.entries ?? [];
      } catch {
        /* SW unreachable — keep the empty state */
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const stats = $derived(computePercentiles(entries));
  const failed = $derived(entries.filter((e) => e.error !== undefined).length);

  const histogram = $derived.by(() => {
    const latencies = entries.filter((e) => e.error === undefined).map((e) => e.latencyMs);
    if (latencies.length === 0) return { bins: [] as number[], min: 0, max: 0 };
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const range = Math.max(1, max - min);
    const bins = Array.from({ length: 10 }, () => 0);
    for (const v of latencies) {
      const idx = Math.min(9, Math.floor(((v - min) / range) * 10));
      bins[idx] = (bins[idx] ?? 0) + 1;
    }
    return { bins, min, max };
  });

  const maxBin = $derived(histogram.bins.length === 0 ? 0 : Math.max(...histogram.bins));

  function copyJson(): void {
    void navigator.clipboard.writeText(JSON.stringify(entries, null, 2)).catch(() => {
      /* silent */
    });
  }
</script>

<div class="perf" data-ega-perf-histogram>
  {#if stats.n > 0 || failed > 0}
    <div class="perf-stats">
      <span>n: {stats.n} / {PERF_BUFFER_MAX}</span>
      <span>P50: {Math.round(stats.p50)} ms</span>
      <span>P95: {Math.round(stats.p95)} ms</span>
      {#if failed > 0}<span>failed: {failed}</span>{/if}
    </div>
  {/if}
  {#if histogram.bins.length > 0}
    <svg viewBox="0 0 200 60" class="perf-svg" role="img" aria-label="Latency histogram">
      {#each histogram.bins as count, i (i)}
        {@const h = maxBin === 0 ? 0 : (count / maxBin) * 55}
        <rect x={i * 20 + 2} y={60 - h} width={16} height={h} fill="var(--color-accent)" />
      {/each}
    </svg>
    <div class="perf-axis">
      <span>{Math.round(histogram.min)} ms</span>
      <span>{Math.round(histogram.max)} ms</span>
    </div>
  {:else if failed > 0}
    <p class="perf-empty">No request has completed yet; only failures so far.</p>
  {:else}
    <p class="perf-empty">
      No entries since the background worker last started. Translate something to populate this
      histogram.
    </p>
  {/if}
  <div class="perf-actions">
    <button type="button" onclick={copyJson} disabled={entries.length === 0}>Copy JSON</button>
  </div>
</div>

<style>
  .perf {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .perf-stats {
    display: flex;
    gap: var(--space-3);
    font-size: var(--fs-sm);
    font-family: var(--font-mono);
    color: var(--color-muted);
  }
  .perf-svg {
    width: 100%;
    max-width: 400px;
    height: 60px;
    background: var(--color-bg-sunken);
    border-radius: var(--radius-sm);
  }
  .perf-axis {
    display: flex;
    justify-content: space-between;
    max-width: 400px;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    font-family: var(--font-mono);
  }
  .perf-empty {
    color: var(--color-muted);
    font-size: var(--fs-sm);
    margin: 0;
  }
  .perf-actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
