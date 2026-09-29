import { describe, expect, it } from 'vitest';
import { makeAsyncLock } from '@/shared/utils/async-lock';

describe('makeAsyncLock', () => {
  it('serializes ops in submission order', async () => {
    const lock = makeAsyncLock();
    const order: number[] = [];
    const p1 = lock(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
      return 'a';
    });
    const p2 = lock(async () => {
      order.push(2);
      return 'b';
    });
    const p3 = lock(async () => {
      order.push(3);
      return 'c';
    });
    const [a, b, c] = await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
    expect([a, b, c]).toEqual(['a', 'b', 'c']);
  });

  it('returns the fn result', async () => {
    const lock = makeAsyncLock();
    const out = await lock(async () => 42);
    expect(out).toBe(42);
  });

  it('propagates rejection to the caller', async () => {
    const lock = makeAsyncLock();
    await expect(lock(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });

  it('one rejection does not poison subsequent ops', async () => {
    const lock = makeAsyncLock();
    const p1 = lock(async () => Promise.reject(new Error('boom')));
    const p2 = lock(async () => 'ok');
    await expect(p1).rejects.toThrow('boom');
    await expect(p2).resolves.toBe('ok');
  });

  it('subsequent op waits for the rejected one to settle', async () => {
    const lock = makeAsyncLock();
    const order: string[] = [];
    const p1 = lock(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('a');
      throw new Error('boom');
    });
    const p2 = lock(async () => {
      order.push('b');
    });
    await Promise.allSettled([p1, p2]);
    expect(order).toEqual(['a', 'b']);
  });

  it('independent lock instances do not block each other', async () => {
    const lockA = makeAsyncLock();
    const lockB = makeAsyncLock();
    let bRan = false;
    const blockedA = lockA(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await lockB(async () => {
      bRan = true;
    });
    expect(bRan).toBe(true);
    await blockedA;
  });
});
