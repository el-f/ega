import { swKeepaliveInternal } from '@/background/swKeepalive';

/** Test-only snapshot of the keepalive state. */
export function swKeepaliveState(): { active: boolean; inflight: number } {
  return {
    active: swKeepaliveInternal.timer !== null,
    inflight: swKeepaliveInternal.inflightCount,
  };
}
