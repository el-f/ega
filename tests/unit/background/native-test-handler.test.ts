import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { handleNativeTest } from '@/background/native-test';
import { createCancelToken } from '@/shared/cancel-token';
import {
  send,
  getStatus,
  resetPortManagerForTest as resetPortManager,
} from '@/shared/cli-session/port-manager';
import type { Msg, NativeTestReply } from '@/shared/messages';
import type { BackendConfig, TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { swKeepaliveState } from '@tests/_helpers/swKeepalive.test-utils';

type NativeTestMsg = Extract<Msg, { kind: 'native:test' }>;

function makeCfg(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    apiKeys: {},
    model: {
      anthropic: 'claude-sonnet-4-5',
      openai: 'gpt-4o-mini',
      gemini: 'gemini-2.5-flash',
      groq: 'llama-3.3-70b-versatile',
      deepseek: 'deepseek-chat',
      together: '',
      mistral: '',
      xai: '',
      fireworks: '',
      openrouter: '',
      ollama: 'llama3.2',
      localserver: '',
      native: '',
    },
    advanced: {
      temperature: 0.2,
      maxTokens: 1024,
    },
    ...overrides,
  };
}

function makeMsg(overrides: Partial<NativeTestMsg> = {}): NativeTestMsg {
  return {
    kind: 'native:test',
    cfg: makeCfg(),
    text: 'marhaba ya habibi',
    sourceLang: 'arabizi',
    targetLang: 'en',
    timeoutMs: 5_000,
    ...overrides,
  };
}

describe('handleNativeTest', () => {
  beforeEach(() => {
    resetPortManager();
  });

  it('returns {ok:true, result, totalMs, firstDeltaMs} on a successful translate', async () => {
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async (a: TranslateCallArgs) => {
        a.onChunk({ type: 'delta', requestId: a.req.id, text: 'OK' });
        a.onChunk({ type: 'done', requestId: a.req.id, confidence: 0.9 });
      },
    };
    let reply: NativeTestReply | undefined;
    await handleNativeTest(makeMsg(), (r) => (reply = r), {
      resolveBackend: () => backend,
      createCancelToken,
      defaultTimeoutMs: 60_000,
    });
    expect(reply?.ok).toBe(true);
    expect(reply?.result).toBe('OK');
    expect(reply?.error).toBeUndefined();
    expect(typeof reply?.totalMs).toBe('number');
    expect(typeof reply?.firstDeltaMs).toBe('number');
  });

  it('holds the SW keepalive for the length of the test and releases it after', async () => {
    const duringTest: { active: boolean; inflight: number }[] = [];
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async (a: TranslateCallArgs) => {
        duringTest.push(swKeepaliveState());
        a.onChunk({ type: 'done', requestId: a.req.id, confidence: 0.9 });
      },
    };
    await handleNativeTest(makeMsg(), () => {}, {
      resolveBackend: () => backend,
      createCancelToken,
      defaultTimeoutMs: 60_000,
    });
    expect(duringTest[0]).toEqual({ active: true, inflight: 1 });
    expect(swKeepaliveState()).toEqual({ active: false, inflight: 0 });
  });

  it('releases the keepalive when the backend throws', async () => {
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async () => {
        throw new Error('boom');
      },
    };
    await handleNativeTest(makeMsg(), () => {}, {
      resolveBackend: () => backend,
      createCancelToken,
      defaultTimeoutMs: 60_000,
    });
    expect(swKeepaliveState()).toEqual({ active: false, inflight: 0 });
  });

  it('returns {ok:false, error} when the backend cannot be resolved', async () => {
    let reply: NativeTestReply | undefined;
    await handleNativeTest(makeMsg(), (r) => (reply = r), {
      resolveBackend: () => null,
      createCancelToken,
      defaultTimeoutMs: 60_000,
    });
    expect(reply?.ok).toBe(false);
    expect(reply?.error).toBe('Native backend not registered');
  });

  it('surfaces an error chunk as {ok:false, error}', async () => {
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async (a: TranslateCallArgs) => {
        a.onChunk({
          type: 'error',
          requestId: a.req.id,
          code: 'NATIVE_SPAWN_FAIL',
          message: 'CLI gone',
        });
      },
    };
    let reply: NativeTestReply | undefined;
    await handleNativeTest(makeMsg(), (r) => (reply = r), {
      resolveBackend: () => backend,
      createCancelToken,
      defaultTimeoutMs: 60_000,
    });
    expect(reply?.ok).toBe(false);
    expect(reply?.error).toBe('Helper app failed: CLI gone');
    expect(reply?.code).toBe('NATIVE_SPAWN_FAIL');
  });

  it('catches synchronous translate rejections', async () => {
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async () => {
        throw new Error('boom');
      },
    };
    let reply: NativeTestReply | undefined;
    await handleNativeTest(makeMsg(), (r) => (reply = r), {
      resolveBackend: () => backend,
      createCancelToken,
      defaultTimeoutMs: 60_000,
    });
    expect(reply?.ok).toBe(false);
    expect(reply?.error).toBe('boom');
    expect(reply?.code).toBeUndefined();
  });

  it('omits firstDeltaMs when the backend produced no delta chunks', async () => {
    const backend: TranslationBackend = {
      id: asBackendIdUnsafe('native'),
      manifest: testManifest('native'),
      isAvailable: async () => true,
      translate: async (a: TranslateCallArgs) => {
        a.onChunk({ type: 'done', requestId: a.req.id, confidence: 0.5 });
      },
    };
    let reply: NativeTestReply | undefined;
    await handleNativeTest(makeMsg(), (r) => (reply = r), {
      resolveBackend: () => backend,
      createCancelToken,
      defaultTimeoutMs: 60_000,
    });
    expect(reply?.ok).toBe(true);
    expect(reply?.firstDeltaMs).toBeUndefined();
  });

  it('SW port-manager flips to "warm" when the backend triggers a session/spawned frame', () => {
    // Only the SW's port-manager copy sees this frame; an in-page translate leaves it cold.
    const connectNativeMock = chrome.runtime.connectNative as unknown as Mock;
    type FrameListener = (msg: unknown) => void;
    type DisconnectListener = (port: chrome.runtime.Port) => void;
    const msgs: FrameListener[] = [];
    const dis: DisconnectListener[] = [];
    interface StubPort {
      postMessage: Mock;
      disconnect: Mock;
      onMessage: {
        addListener: (f: FrameListener) => void;
        removeListener: (f: FrameListener) => void;
      };
      onDisconnect: {
        addListener: (f: DisconnectListener) => void;
        removeListener: (f: DisconnectListener) => void;
      };
    }
    const port: StubPort = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: (f) => msgs.push(f),
        removeListener: () => {},
      },
      onDisconnect: {
        addListener: (f) => dis.push(f),
        removeListener: () => {},
      },
    };
    connectNativeMock.mockReturnValue(port as unknown as chrome.runtime.Port);
    expect(getStatus()).toBe('cold');
    send({ v: 1, kind: 'translate', id: 'native-test-1' }, () => {});
    expect(getStatus()).toBe('connecting');
    msgs.forEach((f) => f({ v: 1, kind: 'session', provider: 'claude', state: 'spawned' }));
    expect(getStatus()).toBe('warm');
  });
});
