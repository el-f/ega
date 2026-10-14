// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { add, clear, list, size, onChange } from '@/content/accumulator';
import { resetAccumulator } from '@tests/_helpers/accumulator.test-utils';

describe('accumulator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAccumulator();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty', () => {
    expect(size()).toBe(0);
    expect(list()).toEqual([]);
  });

  it('add() appends and returns new size', () => {
    const n1 = add({ text: 'hello', rect: new DOMRect(0, 0, 10, 10) });
    const n2 = add({ text: 'world', rect: new DOMRect(10, 0, 10, 10) });
    expect(n1).toBe(1);
    expect(n2).toBe(2);
    expect(list().map((e) => e.text)).toEqual(['hello', 'world']);
  });

  it('clear() empties the queue', () => {
    add({ text: 'hello', rect: new DOMRect() });
    add({ text: 'world', rect: new DOMRect() });
    clear();
    expect(size()).toBe(0);
  });

  it('onChange fires after add and clear', () => {
    const fn = vi.fn();
    const off = onChange(fn);
    add({ text: 'a', rect: new DOMRect() });
    add({ text: 'b', rect: new DOMRect() });
    clear();
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    add({ text: 'c', rect: new DOMRect() });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('queue auto-clears after 90s of idle', () => {
    add({ text: 'one', rect: new DOMRect() });
    vi.advanceTimersByTime(89_999);
    expect(size()).toBe(1);
    vi.advanceTimersByTime(2);
    expect(size()).toBe(0);
  });

  it('onChange fires when TTL auto-clears the queue', () => {
    const fn = vi.fn();
    onChange(fn);
    add({ text: 'one', rect: new DOMRect() });
    expect(fn).toHaveBeenCalledTimes(1); // add
    vi.advanceTimersByTime(90_001);
    expect(size()).toBe(0);
    expect(fn).toHaveBeenCalledTimes(2); // TTL-driven clear
  });

  it('adding again resets the idle timer', () => {
    add({ text: 'one', rect: new DOMRect() });
    vi.advanceTimersByTime(60_000);
    add({ text: 'two', rect: new DOMRect() });
    vi.advanceTimersByTime(60_000);
    expect(size()).toBe(2);
    vi.advanceTimersByTime(31_000);
    expect(size()).toBe(0);
  });
});
