import { perfTimingsInternal } from './perf-timings';

/** Test-only: clear the ring buffer + reset write cursor. Imported only by
 *  tests so the prod surface stays free of test escape hatches. */
export function resetPerfTimings(): void {
  for (let i = 0; i < perfTimingsInternal.size; i++) {
    perfTimingsInternal.ring[i] = undefined;
  }
  perfTimingsInternal.writeIndex = 0;
}
