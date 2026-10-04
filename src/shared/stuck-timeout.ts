import {
  DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS,
  DEFAULT_TRANSLATE_TIMEOUT_MS,
} from '@/shared/constants';
import type { Settings } from '@/shared/types';

/** Head-room over the wall-clock budget: the router's ceiling and every renderer's stuck guard add the same margin. */
export const TIMEOUT_GRACE_MS = 30_000;

/** One source of truth for every renderer's stuck guard: the budget the router really uses, plus head-room. */
export function stuckTimeoutMs(s: Pick<Settings, 'translateTimeoutMs'> | null | undefined): number {
  return (s?.translateTimeoutMs ?? DEFAULT_TRANSLATE_TIMEOUT_MS) + TIMEOUT_GRACE_MS;
}

/** Image tooltips receive no deltas, so their guard must cover the whole vision budget. */
export function imageStuckTimeoutMs(
  s: Pick<Settings, 'imageTranslateTimeoutMs'> | null | undefined,
): number {
  return (s?.imageTranslateTimeoutMs ?? DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS) + TIMEOUT_GRACE_MS;
}
