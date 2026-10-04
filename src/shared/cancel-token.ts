export type CancelReason = 'wallclock' | 'user';

export interface CancelToken {
  readonly signal: AbortSignal;
  readonly reason: CancelReason | undefined;
}

export interface CancelTokenSource {
  readonly token: CancelToken;
  cancel(reason: CancelReason): void;
}

/** Thin AbortController wrapper; the reason rides `signal.reason` as an AbortError message. */
export function createCancelToken(parent?: AbortSignal): CancelTokenSource {
  const ctrl = new AbortController();
  const abort = (reason: CancelReason): void => {
    if (!ctrl.signal.aborted) ctrl.abort(new DOMException(reason, 'AbortError'));
  };
  // A parent abort carries an opaque reason, so report it as 'user'.
  if (parent?.aborted) abort('user');
  else parent?.addEventListener('abort', () => abort('user'), { once: true });
  return {
    token: {
      signal: ctrl.signal,
      get reason(): CancelReason | undefined {
        if (!ctrl.signal.aborted) return undefined;
        const r: unknown = ctrl.signal.reason;
        return r instanceof DOMException && r.message === 'wallclock' ? 'wallclock' : 'user';
      },
    },
    cancel: abort,
  };
}
