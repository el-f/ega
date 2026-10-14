// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { whenPresent } from '@/options/deep-link';

afterEach(() => {
  vi.useRealTimers();
});

// A page or test that goes away mid-retry has no document left; the retry must end quietly,
// not throw "document is not defined" from a timer (it failed the unit run after Options tests).
describe('whenPresent after the document is gone', () => {
  it('stops retrying without throwing', () => {
    vi.useFakeTimers();
    const onFound = vi.fn();
    const onCancel = vi.fn();
    expect(typeof document).toBe('undefined');
    whenPresent('#never', onFound, { onCancel, attempts: 3, intervalMs: 16 });
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    expect(onFound).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
