import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { withoutShippedTaskFields } from '@/shared/storage/sanitise';
import { BUILT_IN_TASK_SWITCHES, hasOwnPrompt } from '@/shared/task-view';
import { ALL_TASKS, type Task } from '@/shared/task-prompts';
import { buildTaskTemplate } from '@/shared/task-template';
import type { TaskEdit } from '@/shared/settings-schema';

const arbTaskId = fc.constantFrom(...(ALL_TASKS as readonly Task[]));

/** Each field is absent, the shipped value, or something else, so all three cases come up often. */
function arbEdit(t: Task): fc.Arbitrary<TaskEdit> {
  const prompt = hasOwnPrompt(t) ? buildTaskTemplate(t) : { system: 'tpl', user: 'tpl' };
  const shipped = BUILT_IN_TASK_SWITCHES[t];
  return fc.record(
    {
      system: fc.oneof(fc.constant(prompt.system), fc.string({ maxLength: 40 })),
      user: fc.oneof(fc.constant(prompt.user), fc.string({ maxLength: 40 })),
      pageContext: fc.oneof(fc.constant(shipped.pageContext), fc.boolean()),
      glossary: fc.oneof(fc.constant(shipped.glossary), fc.boolean()),
      effort: fc.constantFrom('off' as const, 'low' as const, 'medium' as const, 'high' as const),
    },
    { requiredKeys: [] },
  );
}

const arbCase = arbTaskId.chain((t) => arbEdit(t).map((edit) => ({ t, edit })));

describe('withoutShippedTaskFields', () => {
  it('a second prune changes nothing', () => {
    fc.assert(
      fc.property(arbCase, ({ t, edit }) => {
        const once = withoutShippedTaskFields(t, edit);
        expect(withoutShippedTaskFields(t, once)).toEqual(once);
      }),
    );
  });

  it('never keeps a field equal to the shipped value, and never drops an editable field that differs', () => {
    fc.assert(
      fc.property(arbCase, ({ t, edit }) => {
        const out = withoutShippedTaskFields(t, edit);
        const shipped = BUILT_IN_TASK_SWITCHES[t];
        const prompt = hasOwnPrompt(t) ? buildTaskTemplate(t) : null;
        for (const half of ['system', 'user'] as const) {
          const differs =
            prompt !== null && edit[half] !== undefined && edit[half] !== prompt[half];
          expect(out[half] !== undefined).toBe(differs);
        }
        for (const sw of ['pageContext', 'glossary'] as const) {
          const differs = edit[sw] !== undefined && edit[sw] !== shipped[sw];
          expect(out[sw] !== undefined).toBe(differs);
        }
        // The shipped level is a floor under the global Effort, so a pick equal to it still means something.
        expect(out.effort).toBe(edit.effort);
      }),
    );
  });
});
