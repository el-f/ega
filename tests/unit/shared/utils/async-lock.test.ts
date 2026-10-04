import { describe, expect, it } from 'vitest';
import { makeAsyncLock } from '@/shared/utils/async-lock';
import { flushAsync } from '@tests/_helpers/async';

/** A promise the test resolves by hand, so a slow op is slow until the test says otherwise. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open = (): void => {};
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}

describe('makeAsyncLock', () => {
  it('serializes ops in submission order', async () => {
    const lock = makeAsyncLock();
    const order: number[] = [];
    const slow = gate();
    const p1 = lock(async () => {
      await slow.wait;
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
    // Unserialized ops 2 and 3 would have run within this flush.
    await flushAsync();
    expect(order).toEqual([]);
    slow.open();
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
    const slow = gate();
    const p1 = lock(async () => {
      await slow.wait;
      order.push('a');
      throw new Error('boom');
    });
    const p2 = lock(async () => {
      order.push('b');
    });
    await flushAsync();
    expect(order).toEqual([]);
    slow.open();
    await Promise.allSettled([p1, p2]);
    expect(order).toEqual(['a', 'b']);
  });

  it('independent lock instances do not block each other', async () => {
    const lockA = makeAsyncLock();
    const lockB = makeAsyncLock();
    let bRan = false;
    const held = gate();
    const blockedA = lockA(() => held.wait);
    const b = lockB(async () => {
      bRan = true;
    });
    await flushAsync();
    expect(bRan).toBe(true);
    held.open();
    await Promise.all([blockedA, b]);
  });
});
