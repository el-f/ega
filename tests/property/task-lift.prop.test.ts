// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { sanitiseStoredSettings } from '@/shared/storage/sanitise';
import { ALL_TASKS, type Task } from '@/shared/task-prompts';
import { buildTaskTemplate } from '@/shared/task-template';

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const OWN: readonly Task[] = ALL_TASKS.filter((t) => t !== 'translate' && t !== 'explain');

/** A half is the shipped one, a short edit, or an edit that reads {{context}}. */
function arbHalf(shipped: string): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(shipped),
    fc.string({ maxLength: 30 }),
    fc.string({ maxLength: 20 }).map((s) => `${s} {{context}}`),
  );
}

const arbTemplates = fc.dictionary(
  fc.constantFrom(...ALL_TASKS),
  fc.constantFrom(...OWN).chain((t) => {
    const shipped = buildTaskTemplate(t);
    return fc.record(
      { system: arbHalf(shipped.system), user: arbHalf(shipped.user) },
      { requiredKeys: [] },
    );
  }),
);
const arbEfforts = fc.dictionary(
  fc.constantFrom(...ALL_TASKS),
  fc.constantFrom('low', 'medium', 'high'),
);

describe('moving the old per-task maps into task edits', () => {
  it('a second read of the saved row changes nothing', () => {
    fc.assert(
      fc.property(arbTemplates, arbEfforts, (taskTemplates, taskReasoningEfforts) => {
        const once = sanitiseStoredSettings(
          { advanced: { taskTemplates }, taskReasoningEfforts },
          [],
        );
        const twice = sanitiseStoredSettings(JSON.parse(JSON.stringify(once)), []);
        expect(twice).toEqual(once);
      }),
    );
  });

  it('keeps every picked effort, every edited own-prompt half, and no copy of a shipped half', () => {
    fc.assert(
      fc.property(arbTemplates, arbEfforts, (taskTemplates, taskReasoningEfforts) => {
        const s = sanitiseStoredSettings({ advanced: { taskTemplates }, taskReasoningEfforts }, []);
        for (const t of ALL_TASKS) {
          // A picked effort stays even when it equals the shipped floor.
          const effort = taskReasoningEfforts[t];
          expect(s.taskOverrides[t]?.effort).toBe(effort);
          const shipped = OWN.includes(t) ? buildTaskTemplate(t) : null;
          for (const h of ['system', 'user'] as const) {
            const stored = taskTemplates[t]?.[h];
            const kept = shipped !== null && stored !== undefined && stored !== shipped[h];
            expect(s.taskOverrides[t]?.[h]).toBe(kept ? stored : undefined);
          }
        }
      }),
    );
  });
});

describe('a reset after the move', () => {
  it('stays reset when the saved row is read again, for any subset of tasks', () => {
    fc.assert(
      fc.property(
        arbTemplates,
        arbEfforts,
        fc.subarray([...ALL_TASKS]),
        (taskTemplates, taskReasoningEfforts, resetTasks) => {
          const once = sanitiseStoredSettings(
            { advanced: { taskTemplates }, taskReasoningEfforts },
            [],
          );
          const kept = Object.fromEntries(
            Object.entries(once.taskOverrides).filter(([t]) => !resetTasks.includes(t as Task)),
          );
          const saved = JSON.parse(JSON.stringify({ ...once, taskOverrides: kept })) as Record<
            string,
            unknown
          >;
          const again = sanitiseStoredSettings(saved, []);
          expect(again.taskOverrides).toEqual(kept);
        },
      ),
    );
  });
});
