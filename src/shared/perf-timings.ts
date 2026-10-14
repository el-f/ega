// In-memory only. Nothing leaves the machine unless the user copies a dump by hand.

interface PerfRecord {
  /** Short stable tag, e.g. 'ctxmenu.click_to_tooltip_open'. */
  label: string;
  /** Duration in ms. Negative and NaN are coerced to 0. */
  ms: number;
  /** Epoch ms at the end of the event. */
  at: number;
  /** The dump does not scrub — the caller must keep this free of PII. */
  meta?: Record<string, string | number | boolean>;
}

const RING_SIZE = 128;

/** Exported only so tests can reset it between cases. */
export const perfTimingsInternal: {
  ring: (PerfRecord | undefined)[];
  writeIndex: number;
  readonly size: number;
} = {
  ring: Array.from({ length: RING_SIZE }),
  writeIndex: 0,
  size: RING_SIZE,
};

/** Record a single timing. Safe to call on hot paths — O(1). */
export function perfRecord(
  label: string,
  ms: number,
  meta?: Record<string, string | number | boolean>,
): void {
  const clean: PerfRecord = {
    label,
    ms: Number.isFinite(ms) && ms > 0 ? ms : 0,
    at: Date.now(),
    ...(meta !== undefined ? { meta } : {}),
  };
  perfTimingsInternal.ring[perfTimingsInternal.writeIndex] = clean;
  perfTimingsInternal.writeIndex = (perfTimingsInternal.writeIndex + 1) % perfTimingsInternal.size;
}

/** Dump the buffer oldest first. Empty slots are skipped. */
export function perfDump(): PerfRecord[] {
  const out: PerfRecord[] = [];
  const { ring, writeIndex, size } = perfTimingsInternal;
  for (let i = 0; i < size; i++) {
    const r = ring[(writeIndex + i) % size];
    if (r) out.push(r);
  }
  return out;
}

/** Start a timer. The returned stopper records the elapsed ms and returns it. */
export function perfStart(label: string) {
  const t0 = performance.now();
  return (meta?: Record<string, string | number | boolean>): number => {
    const dt = performance.now() - t0;
    perfRecord(label, dt, meta);
    return dt;
  };
}
