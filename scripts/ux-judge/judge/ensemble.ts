import { SEVERITY_ORDER, type Severity } from '../config';

/** Majority verdict. A tie picks the higher severity, so a 1-1-1 split never downgrades. */
export function ensemble(verdicts: ReadonlyArray<Severity>): Severity {
  const counts = new Map<Severity, number>();
  for (const v of verdicts) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: Severity = 'ok';
  let bestCount = 0;
  for (const [sev, c] of counts) {
    if (c > bestCount || (c === bestCount && SEVERITY_ORDER[sev] > SEVERITY_ORDER[best])) {
      best = sev;
      bestCount = c;
    }
  }
  return best;
}
