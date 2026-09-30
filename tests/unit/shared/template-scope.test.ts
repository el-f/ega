import { describe, it, expectTypeOf } from 'vitest';
import type { Scope } from '@/shared/template-scope.types';

describe('Scope', () => {
  it('only contains global | task | preset variants', () => {
    expectTypeOf<Scope['scope']>().toEqualTypeOf<'global' | 'task' | 'preset'>();
  });

  it('global variant has no extra properties', () => {
    const s: Scope = { scope: 'global' };
    expectTypeOf(s).toMatchTypeOf<{ scope: 'global' }>();
  });

  it('task variant carries a Task', () => {
    expectTypeOf<Extract<Scope, { scope: 'task' }>['task']>().toBeString();
  });

  it('preset variant carries a presetId string', () => {
    expectTypeOf<Extract<Scope, { scope: 'preset' }>['presetId']>().toBeString();
  });
});
