import type { ErrCode } from '@/shared/types';
import type { SettingsTab } from '@/shared/settings-tabs';

export interface ErrPolicy {
  /** The same provider is worth another attempt. */
  readonly retryable: boolean;
  /** The next backend in the chain is worth trying. */
  readonly rotate: boolean;
  /** Ceiling for an automatic retry loop, counting the first attempt. Absent = the caller's own ceiling stands. */
  readonly maxAttempts?: number;
  /** Options tab holding the setting that fixes this code. Absent = no setting fixes it. */
  readonly optionsTab?: SettingsTab;
}

export const ERR_POLICY: Record<ErrCode, ErrPolicy> = {
  NETWORK: { retryable: true, rotate: true },
  SERVER: { retryable: true, rotate: true },
  RATE_LIMIT: { retryable: true, rotate: true },
  TIMEOUT: { retryable: true, rotate: true },
  AUTH: { retryable: false, rotate: true, optionsTab: 'backends' },
  QUOTA: { retryable: false, rotate: true, optionsTab: 'backends' },
  NATIVE_NOT_INSTALLED: { retryable: false, rotate: true, optionsTab: 'backends' },
  NATIVE_SPAWN_FAIL: { retryable: false, rotate: true, optionsTab: 'backends' },
  NO_BACKEND: { retryable: false, rotate: false, optionsTab: 'backends' },
  // One REQUEST covers max-tokens (Translate), an unknown model id (Backends) and an oversize request
  // (no setting at all), so the message decides the tab, not the code.
  REQUEST: { retryable: false, rotate: false },
  // A malformed envelope usually parses on the next sample; a second failure is the prompt, not luck.
  PARSE: { retryable: true, rotate: false, maxAttempts: 2 },
  // PROTOCOL = truncated stream — a transient drop, so retry and rotate like NETWORK.
  PROTOCOL: { retryable: true, rotate: true },
  UNSUPPORTED: { retryable: false, rotate: false, optionsTab: 'backends' },
  // No optionsTab: no setting fixes a blob: URL, an oversize file or a format the model cannot read.
  IMAGE_UNSUPPORTED: { retryable: false, rotate: false },
  ABORTED: { retryable: false, rotate: false },
  UNKNOWN: { retryable: false, rotate: false },
};

export function shouldRotate(code: ErrCode): boolean {
  return ERR_POLICY[code].rotate;
}

/** `attemptsMade` counts attempts already made, so the first failure is 1. An automatic retry loop must pass it — that is where the per-code ceiling applies. */
export function isRetryable(code: ErrCode, attemptsMade = 1): boolean {
  const policy = ERR_POLICY[code];
  return policy.retryable && attemptsMade < (policy.maxAttempts ?? Number.POSITIVE_INFINITY);
}

/** A copy, not SETTINGS_TABS: a value import would pull the table into the content script (a test checks they match). */
const ERROR_TAB_LABELS: ReadonlyArray<readonly [label: string, tab: SettingsTab]> = [
  ['Answers', 'translate'],
  // The tab's old name, still inside messages kept in saved conversations and the request list.
  ['Translate', 'translate'],
  ['Backends', 'backends'],
];

/** The tab the error sentence names in its own "Settings → X" clause, else the code's policy tab. */
export function optionsTabForMessage(
  message: string,
  code: ErrCode | null,
): SettingsTab | undefined {
  for (const [label, tab] of ERROR_TAB_LABELS) {
    if (message.includes(`Settings → ${label}`)) return tab;
  }
  return code === null ? undefined : ERR_POLICY[code].optionsTab;
}
