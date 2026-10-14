import { describe, it, expect } from 'vitest';
import { invariant } from '@/shared/invariants';

describe('invariant', () => {
  it('throws in any env when condition is false (violations are always bugs)', () => {
    expect(() => invariant(false, 'contract')).toThrow(/contract/);
  });
  it('no-ops when condition is true', () => {
    expect(() => invariant(true, 'ok')).not.toThrow();
  });
});
