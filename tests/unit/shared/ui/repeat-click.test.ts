import { describe, expect, it } from 'vitest';
import { REPEAT_CLICK_MS, repeatClickGuard } from '@/shared/ui/repeat-click';

const click = (detail: number, timeStamp: number): MouseEvent =>
  ({ detail, timeStamp }) as unknown as MouseEvent;

describe('repeatClickGuard', () => {
  it('drops the rest of a double-click, and acts on a click run slower than the window', () => {
    const isRepeat = repeatClickGuard();
    expect(isRepeat(click(1, 1000))).toBe(false);
    expect(isRepeat(click(2, 1200))).toBe(true);
    // The browser keeps counting while the clicks come fast; the third one still acts once the window has passed.
    expect(isRepeat(click(3, 1000 + REPEAT_CLICK_MS))).toBe(false);
    expect(isRepeat(click(4, 1100 + REPEAT_CLICK_MS))).toBe(true);
    expect(isRepeat(click(5, 1000 + 2 * REPEAT_CLICK_MS))).toBe(false);
  });

  it('a keyboard click (detail 0) always acts', () => {
    const isRepeat = repeatClickGuard();
    expect(isRepeat(click(1, 1000))).toBe(false);
    expect(isRepeat(click(0, 1001))).toBe(false);
    expect(isRepeat(click(0, 1002))).toBe(false);
  });

  // A new reply mounts a new Stop under the pointer: the rest of the double-click that pressed Retry lands on it.
  it('a new button drops a click run already under way, then acts once the window passes', () => {
    const isRepeat = repeatClickGuard();
    expect(isRepeat(click(2, 1000))).toBe(true);
    expect(isRepeat(click(3, 1200))).toBe(true);
    expect(isRepeat(click(4, 1000 + REPEAT_CLICK_MS))).toBe(false);
  });
});
