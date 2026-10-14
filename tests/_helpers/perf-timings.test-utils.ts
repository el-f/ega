import { perfTimingsInternal } from '@/shared/perf-timings';

/** Test-only: clear the ring buffer + reset write cursor. */
export function resetPerfTimings(): void {
  for (let i = 0; i < perfTimingsInternal.size; i++) {
    perfTimingsInternal.ring[i] = undefined;
  }
  perfTimingsInternal.writeIndex = 0;
}
