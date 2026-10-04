import type { Mock } from 'vitest';

const sendMessage = chrome.runtime.sendMessage as Mock;

/** The `translate:start` messages sent through the shared chrome mock, oldest first. */
export function startCalls(): Record<string, unknown>[] {
  return sendMessage.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
}
