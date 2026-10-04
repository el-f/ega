import type { Settings } from './types';

/** `ok: true` means the patch was written and broadcast; `ok: false` means neither happened. */
export interface PatchAck {
  ok: boolean;
  settings?: Settings;
  reason?: 'quota' | 'schema' | 'unknown';
}

/** Resolves once the SW has written the merged value. */
export function patchSettings(patch: Partial<Settings>): Promise<PatchAck> {
  return new Promise((resolve) => {
    try {
      const result = chrome.runtime.sendMessage({ kind: 'settings:update', patch });
      // sendMessage returns a thenable when no callback is passed (MV3 promise overload).
      Promise.resolve(result as Promise<unknown> | unknown)
        .then((ack) => resolve(normaliseAck(ack)))
        .catch(() => resolve({ ok: false, reason: 'unknown' }));
    } catch {
      resolve({ ok: false, reason: 'unknown' });
    }
  });
}

function normaliseAck(raw: unknown): PatchAck {
  if (raw === null || typeof raw !== 'object') return { ok: false, reason: 'unknown' };
  const r = raw as Record<string, unknown>;
  if (r['ok'] !== true) {
    const reason = r['reason'] === 'quota' || r['reason'] === 'schema' ? r['reason'] : 'unknown';
    return { ok: false, reason };
  }
  const out: PatchAck = { ok: true };
  if (r['settings'] && typeof r['settings'] === 'object') {
    out.settings = r['settings'] as Settings;
  }
  return out;
}
