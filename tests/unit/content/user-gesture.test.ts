// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { dispatchAsUser, isUserGesture } from '@/content/user-gesture';

// Unit builds pin isUserGesture true (jsdom cannot mint a trusted event); tests/e2e/synthetic-events.spec.ts tests the gate.
describe('dispatchAsUser', () => {
  it('delivers the event to the target listeners', () => {
    const target = document.createElement('button');
    const seen = vi.fn((e: Event) => isUserGesture(e));
    target.addEventListener('click', seen);

    dispatchAsUser(target, new MouseEvent('click', { bubbles: true }));

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.results[0]?.value).toBe(true);
  });

  it('keeps dispatching after a listener throws', () => {
    const target = document.createElement('div');
    target.addEventListener('keydown', () => {
      throw new Error('listener failed');
    });
    const onError = vi.fn((e: ErrorEvent) => e.preventDefault());
    window.addEventListener('error', onError);
    try {
      dispatchAsUser(target, new KeyboardEvent('keydown', { key: 'Escape' }));
      const later = vi.fn();
      target.addEventListener('keydown', later);
      dispatchAsUser(target, new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(later).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('error', onError);
    }
  });
});
