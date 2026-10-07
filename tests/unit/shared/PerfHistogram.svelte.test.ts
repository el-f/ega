// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import PerfHistogram from '@/shared/components/PerfHistogram.svelte';
import type { PerfEntry } from '@/shared/perf-history';
import type { ResultMeta } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';
import { chromeMock } from '@tests/mocks/chrome';

function meta(latencyMs: number): ResultMeta {
  return { backendId: asBackendIdUnsafe('anthropic'), cacheHit: false, latencyMs };
}

function entriesOf(...latencies: number[]): PerfEntry[] {
  return latencies.map((latencyMs) => ({ ...meta(latencyMs), ts: Date.now() }));
}

// The buffer lives in the SW instance — the component must ask over the message bridge.
function stubReply(entries: PerfEntry[]): void {
  (chromeMock.runtime.sendMessage as Mock).mockResolvedValue({ entries });
}

/** The stat pairs as "label value" strings. */
function stats(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.perf-stats div')].map((d) =>
    [d.querySelector('dt')?.textContent, d.querySelector('dd')?.textContent].join(' '),
  );
}

describe('PerfHistogram', () => {
  beforeEach(() => {
    (chromeMock.runtime.sendMessage as Mock).mockReset();
  });

  it('requests the SW buffer via the perf:entries message', async () => {
    stubReply([]);
    render(PerfHistogram);
    await waitFor(() => {
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'perf:entries' });
    });
  });

  it('empty: one line that says how to fill it', async () => {
    stubReply([]);
    const { getByText, container } = render(PerfHistogram);
    await waitFor(() =>
      expect(getByText('Translate something to see response times')).toBeTruthy(),
    );
    expect(container.querySelector('.perf-stats')).toBeNull();
  });

  it('shows labelled stat pairs in plain words', async () => {
    // 18 quick answers and 2 slow ones: the slowest 5% of 20 is the slow pair.
    stubReply([
      ...entriesOf(...Array.from({ length: 18 }, (_, i) => (i + 1) * 10)),
      ...entriesOf(2500, 2500),
    ]);
    const { container } = render(PerfHistogram);
    await waitFor(() => expect(stats(container)).toHaveLength(4));
    const s = stats(container);
    expect(s[0]).toBe('Finished 20 of 20');
    expect(s[1]).toMatch(/^Typical \d+ ms$/);
    expect(s[2]).toBe('Slowest 5% over 2.5 s');
    expect(s[3]).toBe('Failed 0');
  });

  it('labels the axis at both ends and the middle', async () => {
    stubReply(entriesOf(100, 300));
    const { container } = render(PerfHistogram);
    await waitFor(() => expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(0));
    expect([...container.querySelectorAll('.perf-axis span')].map((s) => s.textContent)).toEqual([
      '100 ms',
      '200 ms',
      '300 ms',
    ]);
  });

  it('with recording off: says how to turn it on, and draws nothing', async () => {
    stubReply(entriesOf(100, 300));
    const { container, getByText } = render(PerfHistogram, { props: { off: true } });
    expect(getByText('Response times are off. Turn on Record request details below.')).toBeTruthy();
    await waitFor(() => expect(chromeMock.runtime.sendMessage).toHaveBeenCalled());
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.perf-stats')).toBeNull();
  });

  it('stays on the empty line when the SW is unreachable', async () => {
    (chromeMock.runtime.sendMessage as Mock).mockRejectedValue(
      new Error('Could not establish connection'),
    );
    const { getByText } = render(PerfHistogram);
    await waitFor(() =>
      expect(getByText('Translate something to see response times')).toBeTruthy(),
    );
  });
});
