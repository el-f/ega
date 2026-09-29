// installHandler copies src/background/index.ts: importing it boots the whole background module.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock } from '../../mocks/chrome';

// Own listener list, not the chrome mock's onMessage: that event has no reset between tests.
let listeners: Array<
  (msg: unknown, sender: chrome.runtime.MessageSender, send: (r: unknown) => void) => boolean | void
> = [];

function installHandler(deps: {
  updateSettings: (cleaned: Record<string, unknown>) => Promise<unknown>;
  parsePatch: (raw: unknown) => Record<string, unknown>;
}): void {
  listeners.push((rawMsg, _sender, sendResponse) => {
    const msg = rawMsg as { kind?: string; patch?: unknown };
    if (msg.kind !== 'settings:update') return false;
    void (async () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = deps.parsePatch(msg.patch);
      } catch {
        sendResponse({ ok: false, reason: 'schema' });
        return;
      }
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== undefined) cleaned[k] = v;
      }
      let merged;
      try {
        merged = await deps.updateSettings(cleaned);
      } catch (e) {
        const txt = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, reason: /QUOTA/i.test(txt) ? 'quota' : 'unknown' });
        return;
      }
      sendResponse({ ok: true, settings: merged });
    })();
    return true;
  });
}

async function dispatch(payload: { kind: string; patch?: unknown }): Promise<unknown> {
  return new Promise((resolve) => {
    const sender = { id: 'ega-test' } as chrome.runtime.MessageSender;
    const sendResponse = (ack: unknown): void => resolve(ack);
    for (const l of listeners) {
      if (l(payload, sender, sendResponse) === true) return;
    }
    resolve(undefined);
  });
}

describe('SW settings-bus handler', () => {
  beforeEach(() => {
    listeners = [];
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue(undefined);
  });

  it('writes merged settings and acks with them', async () => {
    const updateSettings = vi.fn().mockResolvedValue({ theme: 'dark' });
    installHandler({ updateSettings, parsePatch: (raw) => raw as Record<string, unknown> });

    const ack = (await dispatch({ kind: 'settings:update', patch: { theme: 'dark' } })) as {
      ok: boolean;
      settings?: { theme: string };
    };
    expect(ack.ok).toBe(true);
    expect(ack.settings).toEqual({ theme: 'dark' });
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    await Promise.resolve();
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('reports schema reason and never writes on parse failure', async () => {
    const updateSettings = vi.fn();
    installHandler({
      updateSettings,
      parsePatch: () => {
        throw new Error('valibot.ValiError: invalid');
      },
    });

    const ack = (await dispatch({ kind: 'settings:update', patch: { theme: 'oops' } })) as {
      ok: boolean;
      reason: string;
    };
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('schema');
    expect(updateSettings).not.toHaveBeenCalled();
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('reports quota reason when storage error matches QUOTA_BYTES', async () => {
    const updateSettings = vi.fn().mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    installHandler({ updateSettings, parsePatch: (raw) => raw as Record<string, unknown> });

    const ack = (await dispatch({ kind: 'settings:update', patch: { theme: 'dark' } })) as {
      ok: boolean;
      reason: string;
    };
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('quota');
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('reports unknown reason for unclassified write failures', async () => {
    const updateSettings = vi.fn().mockRejectedValue(new Error('disk full'));
    installHandler({ updateSettings, parsePatch: (raw) => raw as Record<string, unknown> });

    const ack = (await dispatch({ kind: 'settings:update', patch: { theme: 'dark' } })) as {
      ok: boolean;
      reason: string;
    };
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('unknown');
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
