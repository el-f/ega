import { describe, it, expect } from 'vitest';
import { builtInTask, runnableDefaultTask } from '@/shared/task-prompts';

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
