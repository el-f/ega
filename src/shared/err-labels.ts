import type { ErrCode } from '@/shared/types';
import { assertNever } from '@/shared/invariants';
import { ERROR_COPY } from '@/shared/error-copy';

/** Shared catalog titles also cover logs, exports and legacy notification paths. */
export function errCodeLabel(code: ErrCode): string {
  if (code === 'ABORTED') return 'Canceled';
  if (!Object.hasOwn(ERROR_COPY, code)) return assertNever(code as never);
  return ERROR_COPY[code].title;
}
