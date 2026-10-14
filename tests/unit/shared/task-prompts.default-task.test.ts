import { describe, it, expect } from 'vitest';
import { builtInTask, defaultTaskName, runnableDefaultTask } from '@/shared/task-prompts';

describe('runnableDefaultTask', () => {
  it('runs an enabled built-in default as itself', () => {
    expect(runnableDefaultTask({ defaultTask: 'summarize', disabledTasks: [] })).toBe('summarize');
  });

  it('runs an off default as Translate', () => {
    expect(runnableDefaultTask({ defaultTask: 'summarize', disabledTasks: ['summarize'] })).toBe(
      'translate',
    );
  });

  it('runs a custom default as itself, and an off one as Translate', () => {
    expect(runnableDefaultTask({ defaultTask: 'b5d1c2a0-uuid', disabledTasks: [] })).toBe(
      'b5d1c2a0-uuid',
    );
    expect(
      runnableDefaultTask({ defaultTask: 'b5d1c2a0-uuid', disabledTasks: ['b5d1c2a0-uuid'] }),
    ).toBe('translate');
  });
});

describe('builtInTask', () => {
  it('names a built-in, and nothing for a custom id or an inherited key', () => {
    expect(builtInTask('ask')).toBe('ask');
    expect(builtInTask('b5d1c2a0-uuid')).toBeNull();
    expect(builtInTask('toString')).toBeNull();
  });
});

describe('defaultTaskName', () => {
  const customs = [{ id: 'formal-es', label: 'Formal Spanish' }];

  it("is null for Translate, so an entry keeps Translate's own words", () => {
    expect(defaultTaskName({ defaultTask: 'translate', disabledTasks: [] }, customs)).toBeNull();
    // An off default runs as Translate.
    expect(
      defaultTaskName({ defaultTask: 'summarize', disabledTasks: ['summarize'] }, customs),
    ).toBeNull();
  });

  it('names any other task the entry would run, a custom one by its own label', () => {
    expect(defaultTaskName({ defaultTask: 'summarize', disabledTasks: [] }, customs)).toBe(
      'Summarize',
    );
    expect(defaultTaskName({ defaultTask: 'suggest-replies', disabledTasks: [] }, [])).toBe(
      'Reply ideas',
    );
    expect(defaultTaskName({ defaultTask: 'formal-es', disabledTasks: [] }, customs)).toBe(
      'Formal Spanish',
    );
  });
});
