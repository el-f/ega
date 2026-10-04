import { describe, it, expect } from 'vitest';
import { classifyReplay } from './replay-kinds';
import type { AssertResult } from './tools/assert';

function fail(observed: unknown = 0): AssertResult {
  return { passed: false, predicate: 'x', claim: 'c', observed };
}

function pass(): AssertResult {
  return { passed: true, predicate: 'x', claim: 'c', observed: 1 };
}

describe('classifyReplay', () => {
  it('stable-bug — all 3 rolls fail with matching observed values', () => {
    const q = classifyReplay([[fail(0)], [fail(0)], [fail(0)]]);
    expect(q.kind).toBe('stable-bug');
    expect(q.confidence).toBe(1);
  });

  it('stable-pass — all 3 rolls pass', () => {
    const q = classifyReplay([[pass()], [pass()], [pass()]]);
    expect(q.kind).toBe('stable-pass');
    expect(q.confidence).toBe(1);
  });

  it('partial — mixed pass/fail (2-of-3 fail)', () => {
    const q = classifyReplay([[fail()], [fail()], [pass()]]);
    expect(q.kind).toBe('partial');
    expect(q.confidence).toBeCloseTo(2 / 3, 5);
  });

  it('partial — mixed pass/fail (1-of-3 fail)', () => {
    const q = classifyReplay([[pass()], [fail()], [pass()]]);
    expect(q.kind).toBe('partial');
    expect(q.confidence).toBeCloseTo(2 / 3, 5);
  });

  it('drift — all 3 rolls fail but observed values diverge', () => {
    const q = classifyReplay([[fail(0)], [fail(1)], [fail(2)]]);
    expect(q.kind).toBe('drift');
    expect(q.confidence).toBe(1);
  });

  it('drift — observed differs only by deep structure', () => {
    const q = classifyReplay([[fail({ a: 1 })], [fail({ a: 2 })], [fail({ a: 1 })]]);
    expect(q.kind).toBe('drift');
  });

  it('treats null and undefined observed as equivalent', () => {
    const a: AssertResult = { passed: false, predicate: 'x', claim: 'c', observed: null };
    const b: AssertResult = { passed: false, predicate: 'x', claim: 'c' };
    const q = classifyReplay([[a], [b], [a]]);
    expect(q.kind).toBe('stable-bug');
  });
});
