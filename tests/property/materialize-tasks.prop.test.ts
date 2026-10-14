import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { materializeTasks } from '@/shared/task-view';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { ALL_TASKS } from '@/shared/task-prompts';
import { arbCustomTask } from './arbitraries';

const arbDisabled = fc.array(fc.constantFrom(...ALL_TASKS, 'c1', 'c2', 'gone'), { maxLength: 8 });

describe('materializeTasks', () => {
  it('lists every built-in once, first and in shipped order; custom tasks follow by creation time; Translate is never off', () => {
    fc.assert(
      fc.property(
        fc.array(arbCustomTask, { maxLength: 12 }),
        arbDisabled,
        (customs, disabledTasks) => {
          const views = materializeTasks({ ...DEFAULT_SETTINGS, disabledTasks }, customs);
          expect(views.slice(0, ALL_TASKS.length).map((v) => v.id)).toEqual([...ALL_TASKS]);
          expect(new Set(views.map((v) => v.id)).size).toBe(views.length);
          const rest = views.slice(ALL_TASKS.length);
          expect(rest.every((v) => v.kind === 'custom')).toBe(true);
          const stamps = rest.map((v) => customs.find((c) => c.id === v.id)?.createdAt ?? -1);
          expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
          expect(views.find((v) => v.id === 'translate')?.disabled).toBe(false);
        },
      ),
    );
  });
});
