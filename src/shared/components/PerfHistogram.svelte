<script lang="ts">
  import { onMount } from 'svelte';
  import { computePercentiles, type PerfEntry } from '@/shared/perf-history';
  import { sendMsg } from '@/shared/messages';
  interface Props {
    /** Record request details is off: no time is kept, so the card says how to turn it on. */
    off?: boolean;
    /** What the worker sent back; bind it to show a Copy data action beside the chart. */
    entries?: readonly PerfEntry[];
  }

  // The buffer lives in the service worker's module instance — ask it, never read the local copy.
  let { off = false, entries = $bindable([]) }: Props = $props();

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

  // Under a second in ms, above it in seconds with one decimal.
  function duration(ms: number): string {
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
  }
</script>

<div class="perf" data-ega-perf-histogram>
  {#if off}
    <p class="perf-empty" data-ega-perf-off>
      Response times are off. Turn on Record request details below.
    </p>
  {:else}
    {#if stats.n > 0 || failed > 0}
      <dl class="perf-stats">
        <div>
          <dt>Finished</dt>
          <dd>{stats.n} of {entries.length}</dd>
        </div>
        <div>
          <dt>Typical</dt>
          <dd>{duration(stats.p50)}</dd>
        </div>
        <div>
          <dt>Slowest 5%</dt>
          <dd>over {duration(stats.p95)}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{failed}</dd>
        </div>
      </dl>
    {/if}
    {#if histogram.bins.length > 0}
      <svg viewBox="0 0 200 60" class="perf-svg" role="img" aria-label="Chart of response times">
        {#each histogram.bins as bin, i (i)}
          {@const h = maxBin === 0 ? 0 : (bin / maxBin) * 55}
          <rect x={i * 20 + 2} y={60 - h} width={16} height={h} fill="var(--color-accent)" />
        {/each}
      </svg>
      <div class="perf-axis" aria-hidden="true">
        <span>{duration(histogram.min)}</span>
        <span>{duration((histogram.min + histogram.max) / 2)}</span>
        <span>{duration(histogram.max)}</span>
      </div>
    {:else if failed > 0}
      <p class="perf-empty">No request has finished yet; only failures so far</p>
    {:else}
      <p class="perf-empty">Translate something to see response times</p>
    {/if}
  {/if}
</div>

<style>
  .perf {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .perf-stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    margin: 0;
    font-size: var(--fs-base);
  }
  .perf-stats div {
    display: flex;
    gap: var(--space-2);
  }
  .perf-stats dt {
    color: var(--color-muted);
  }
  .perf-stats dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
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
    font-variant-numeric: tabular-nums;
  }
  .perf-empty {
    color: var(--color-muted);
    font-size: var(--fs-base);
    margin: 0;
  }
</style>
