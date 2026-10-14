import type { BrowserContextRef } from '../agent/tools/browser';
import { dispatchBrowserTool } from '../agent/tools/browser';
import { dispatchStorageTool } from '../agent/tools/storage';
import { dispatchAssertTool, type AssertResult } from '../agent/tools/assert';
import { classifyReplay, type ReplayQuality } from '../agent/replay-kinds';

export interface RecipeStep {
  tool: string;
  input: Record<string, unknown>;
}

export interface ReplayResult {
  passed: boolean;
  assertResults: AssertResult[];
}

export interface ReplayThreeResult {
  stable: boolean;
  results: ReadonlyArray<{ passed: boolean }>;
  /** Finer-grained scoring across the 3 rolls. */
  quality: ReplayQuality;
}

/** passed=true means an assert FAILED (the bug reproduced); a recipe with no assert always returns passed=false. */
export async function replayRecipe(
  ref: BrowserContextRef,
  steps: ReadonlyArray<RecipeStep>,
): Promise<ReplayResult> {
  const assertResults: AssertResult[] = [];
  for (const s of steps) {
    if (s.tool.startsWith('browser_')) {
      await dispatchBrowserTool(ref, s.tool, s.input);
    } else if (s.tool.startsWith('storage_')) {
      await dispatchStorageTool(ref, s.tool, s.input);
    } else if (s.tool === 'assert') {
      const r = await dispatchAssertTool(ref, s.tool, s.input);
      if (r.ok) assertResults.push(r.result);
    }
    // audit_read is read-only telemetry; skipped during replay to keep
    // recipes minimal and avoid coupling to read-time state.
  }
  return {
    passed: assertResults.some((a) => !a.passed),
    assertResults,
  };
}

/**
 * Run the recipe three times in succession against a fresh ref each time.
 * Returns `stable: true` when all three replays agree (all pass or all fail),
 * plus a finer-grained `quality.kind` distinguishing stable-bug / stable-pass
 * / partial / drift. The caller gates spec-stub writing on `kind === 'stable-bug'`.
 */
export async function replayThreeTimes(
  refFactory: () => Promise<BrowserContextRef>,
  steps: ReadonlyArray<RecipeStep>,
): Promise<ReplayThreeResult> {
  const results: { passed: boolean }[] = [];
  const rolls: AssertResult[][] = [];
  for (let i = 0; i < 3; i++) {
    const ref = await refFactory();
    try {
      const r = await replayRecipe(ref, steps);
      results.push({ passed: r.passed });
      rolls.push(r.assertResults);
    } finally {
      // Close the context defensively. The caller's factory owns lifecycle,
      // but a single hung context would block the next roll if we don't.
      try {
        await ref.context.close();
      } catch {
        // ignore — close on a torn-down context is harmless
      }
    }
  }
  const first = results[0];
  const stable = first === undefined ? false : results.every((r) => r.passed === first.passed);
  const quality = classifyReplay(rolls);
  return { stable, results, quality };
}
