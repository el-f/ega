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

  it('renders the empty state when the SW buffer has no entries', async () => {
    stubReply([]);
    const { getByText } = render(PerfHistogram);
    await waitFor(() =>
      expect(getByText(/No entries since the background worker last started/i)).toBeTruthy(),
    );
  });

  it('renders the typical and slowest-5% times in plain words', async () => {
    stubReply(entriesOf(...Array.from({ length: 50 }, (_, i) => i + 1)));
    const { getByText } = render(PerfHistogram);
    await waitFor(() => expect(getByText('50 finished of the last 50 requests')).toBeTruthy());
    expect(getByText(/^Typical: \d+ ms$/)).toBeTruthy();
    expect(getByText(/^Slowest 5%: over \d+ ms$/)).toBeTruthy();
  });

  it('renders SVG histogram bars from the fetched entries', async () => {
    stubReply(entriesOf(...Array.from({ length: 20 }, (_, i) => i + 1)));
    const { container } = render(PerfHistogram);
    await waitFor(() => {
      expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(0);
    });
  });

  it('Copy JSON is disabled on an empty buffer', async () => {
    stubReply([]);
    const { getByText } = render(PerfHistogram);
    await waitFor(() => expect((getByText('Copy JSON') as HTMLButtonElement).disabled).toBe(true));
  });

  it('stays on the empty state when the SW is unreachable', async () => {
    (chromeMock.runtime.sendMessage as Mock).mockRejectedValue(
      new Error('Could not establish connection'),
    );
    const { getByText } = render(PerfHistogram);
    await waitFor(() =>
      expect(getByText(/No entries since the background worker last started/i)).toBeTruthy(),
    );
  });
});
