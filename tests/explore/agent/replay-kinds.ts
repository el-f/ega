import type { AssertResult } from './tools/assert';

export type ReplayKind = 'stable-bug' | 'stable-pass' | 'partial' | 'drift';

export interface ReplayQuality {
  kind: ReplayKind;
  /** 0..1 — proportion of rolls agreeing with the dominant outcome. */
  confidence: number;
  /** Per-roll assert results, in roll order. */
  results: ReadonlyArray<ReadonlyArray<AssertResult>>;
}

/**
 * `stable-bug`: all rolls failed with matching observed values. `drift`: all failed
 * but the values diverge. `stable-pass`: none failed. `partial`: mixed.
 * `confidence` is the share of rolls agreeing with the dominant outcome.
 */
export function classifyReplay(rolls: ReadonlyArray<ReadonlyArray<AssertResult>>): ReplayQuality {
  // True means "this roll detected the bug", i.e. at least one assert failed.
  const perRollPassed = rolls.map((roll) => roll.some((a) => !a.passed));

  const allFailed = perRollPassed.every((p) => p);
  const allPassed = perRollPassed.every((p) => !p);

  if (allPassed) {
    return { kind: 'stable-pass', confidence: 1, results: rolls };
  }

  if (allFailed) {
    if (observedValuesMatch(rolls)) {
      return { kind: 'stable-bug', confidence: 1, results: rolls };
    }
    return { kind: 'drift', confidence: 1, results: rolls };
  }

  const failures = perRollPassed.filter((p) => p).length;
  const successes = perRollPassed.length - failures;
  const dominant = Math.max(failures, successes);
  const confidence = rolls.length > 0 ? dominant / rolls.length : 0;
  return { kind: 'partial', confidence, results: rolls };
}

// Rolls match when every assert shares the same predicate, passed and observed value.
function observedValuesMatch(rolls: ReadonlyArray<ReadonlyArray<AssertResult>>): boolean {
  if (rolls.length < 2) return true;
  const first = rolls[0];
  if (first === undefined) return true;
  const sig = signature(first);
  for (let i = 1; i < rolls.length; i++) {
    const r = rolls[i];
    if (r === undefined) continue;
    if (signature(r) !== sig) return false;
  }
  return true;
}

function signature(roll: ReadonlyArray<AssertResult>): string {
  return JSON.stringify(
    roll.map((a) => ({
      predicate: a.predicate,
      passed: a.passed,
      observed: a.observed ?? null,
    })),
  );
}
