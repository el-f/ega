import { describe, expect, it } from 'vitest';
import { createCancelToken } from '@/shared/cancel-token';

describe('createCancelToken', () => {
  it('starts uncancelled with undefined reason', () => {
    const { token } = createCancelToken();
    expect(token.signal.aborted).toBe(false);
    expect(token.reason).toBeUndefined();
  });

  it('cancel(reason) aborts the signal + tags reason', () => {
    const { token, cancel } = createCancelToken();
    cancel('wallclock');
    expect(token.signal.aborted).toBe(true);
    expect(token.reason).toBe('wallclock');
  });

  it('second cancel is a no-op', () => {
    const { token, cancel } = createCancelToken();
    cancel('user');
    cancel('wallclock');
    expect(token.reason).toBe('user');
  });

  it('the abort reason is an AbortError, so fetch rejections still classify as ABORTED', () => {
    const { token, cancel } = createCancelToken();
    cancel('user');
    const r: unknown = token.signal.reason;
    expect(r).toBeInstanceOf(DOMException);
    expect((r as DOMException).name).toBe('AbortError');
  });

  it('parent abort propagates as user reason', () => {
    const parent = new AbortController();
    const { token } = createCancelToken(parent.signal);
    parent.abort();
    expect(token.signal.aborted).toBe(true);
    expect(token.reason).toBe('user');
  });

  it('pre-aborted parent aborts the child immediately with user reason', () => {
    const parent = new AbortController();
    parent.abort();
    const { token } = createCancelToken(parent.signal);
    expect(token.signal.aborted).toBe(true);
    expect(token.reason).toBe('user');
  });

  it('owner cancel takes precedence over later parent abort', () => {
    const parent = new AbortController();
    const { token, cancel } = createCancelToken(parent.signal);
    cancel('wallclock');
    parent.abort();
    expect(token.reason).toBe('wallclock');
  });
});
