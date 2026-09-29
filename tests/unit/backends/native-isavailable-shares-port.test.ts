import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NativeBackend } from '@/shared/backends/native';
import { _resetForTest as resetPortManager } from '@/shared/cli-session/port-manager';

// Uses the real port-manager with only connectNative stubbed, so physical port opens are countable.

type FrameListener = (msg: unknown) => void;
type DisconnectListener = (port: chrome.runtime.Port) => void;

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
  _emit: (m: unknown) => void;
}

function mockPort(): StubPort {
  const msgs: FrameListener[] = [];
  const dis: DisconnectListener[] = [];
  const port: StubPort = {
    postMessage: vi.fn(),
    disconnect: vi.fn(() => dis.forEach((f) => f(port as unknown as chrome.runtime.Port))),
    onMessage: {
      addListener: (f) => msgs.push(f),
      removeListener: (f) => {
        const i = msgs.indexOf(f);
        if (i >= 0) msgs.splice(i, 1);
      },
    },
    onDisconnect: {
      addListener: (f) => dis.push(f),
      removeListener: (f) => {
        const i = dis.indexOf(f);
        if (i >= 0) dis.splice(i, 1);
      },
    },
    _emit: (m) => msgs.forEach((f) => f(m)),
  };
  return port;
}

const baseConfig = {
  apiKeys: {},
  model: {
    anthropic: 'x',
    openai: 'y',
    gemini: 'gemini-1.5-flash',
    groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-chat',
    together: '',
    mistral: '',
    xai: '',
    fireworks: '',
    openrouter: '',
    ollama: 'llama3.2',
    native: '',
  },
  advanced: {
    promptTemplate: { system: '', user: '' },
    perPresetTemplates: {},
    temperature: 0,
    maxTokens: 1,
  },
};

const connectNativeMock = chrome.runtime.connectNative as unknown as Mock;

describe('NativeBackend.isAvailable shares the port-manager port', () => {
  beforeEach(() => {
    resetPortManager();
    connectNativeMock.mockReset();
  });

  it('two consecutive isAvailable calls open connectNative at most once', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const b = new NativeBackend();

    const p1 = b.isAvailable(baseConfig);
    const firstFrame = port.postMessage.mock.calls[0]?.[0] as { id: string };
    port._emit({ v: 1, id: firstFrame.id, type: 'done' });
    expect(await p1).toBe(true);

    const p2 = b.isAvailable(baseConfig);
    const secondFrame = port.postMessage.mock.calls[1]?.[0] as { id: string };
    expect(secondFrame.id).not.toBe(firstFrame.id);
    port._emit({ v: 1, id: secondFrame.id, type: 'done' });
    expect(await p2).toBe(true);

    expect(connectNativeMock).toHaveBeenCalledTimes(1);
  });
});
