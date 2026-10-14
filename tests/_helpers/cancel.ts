import { createCancelToken } from '@/shared/cancel-token';
import type { CancelToken } from '@/shared/cancel-token';

/** A never-canceled CancelToken; tests that cancel should call createCancelToken() themselves. */
export const noopCancel = (): CancelToken => createCancelToken().token;

/** CancelToken driven by an existing signal; reason becomes 'user' when it aborts. */
export const cancelFromSignal = (signal: AbortSignal): CancelToken =>
  createCancelToken(signal).token;
