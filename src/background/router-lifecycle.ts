export class LifecycleCeilingError extends Error {
  constructor() {
    super('lifecycle ceiling exceeded: op never settled, force-releasing');
    this.name = 'LifecycleCeilingError';
  }
}

const CEILING_SENTINEL = Symbol('ceiling');

export interface LifecycleScope {
  reqId: string;
  inflight: Map<string, AbortController>;
  cancelRequested: Set<string>;
  trackInflight: () => () => void;
  /** Hard ceiling for an op that ignores abort; must be above the per-request wall-clock timeout. */
  maxLifecycleMs?: number;
}

export interface LifecycleContext {
  ctrl: AbortController;
}

export async function withTranslateLifecycle<T>(
  scope: LifecycleScope,
  op: (ctx: LifecycleContext) => Promise<T>,
): Promise<T> {
  const { reqId, inflight, cancelRequested, trackInflight, maxLifecycleMs } = scope;
  inflight.get(reqId)?.abort();
  const ctrl = new AbortController();
  inflight.set(reqId, ctrl);
  if (cancelRequested.delete(reqId)) ctrl.abort();
  const release = trackInflight();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    // A later run for the same id owns the slot now; deleting it would make that run uncancellable.
    if (inflight.get(reqId) === ctrl) inflight.delete(reqId);
    release();
  };

  try {
    let ceilHandle: ReturnType<typeof setTimeout> | undefined;
    const ceilingPromise =
      maxLifecycleMs !== undefined
        ? new Promise<typeof CEILING_SENTINEL>((resolve) => {
            ceilHandle = setTimeout(() => {
              ctrl.abort();
              resolve(CEILING_SENTINEL);
            }, maxLifecycleMs);
            (ceilHandle as { unref?: () => void }).unref?.();
          })
        : null;

    try {
      if (ceilingPromise !== null) {
        const winner = await Promise.race([op({ ctrl }), ceilingPromise]);
        if (winner === CEILING_SENTINEL) throw new LifecycleCeilingError();
        return winner as T;
      }
      return await op({ ctrl });
    } finally {
      if (ceilHandle !== undefined) clearTimeout(ceilHandle);
    }
  } finally {
    cleanup();
  }
}
