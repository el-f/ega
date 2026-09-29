import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeBackend } from '@/shared/backends/native';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslationChunk } from '@/shared/types';

const portManagerMocks = vi.hoisted(() => ({
  send: vi.fn<
    (
      frame: Record<string, unknown>,
      handler: (msg: unknown) => void,
      onDisconnect?: (reason?: string) => void,
    ) => () => void
  >(),
  request: vi.fn(),
  cancel: vi.fn<(id: string) => void>(),
  ping: vi.fn<(timeoutMs: number) => Promise<boolean>>(),
  getStatus: vi.fn(() => 'cold' as const),
  _resetForTest: vi.fn(),
}));

vi.mock('@/shared/cli-session/port-manager', () => portManagerMocks);

const baseConfig = {
  apiKeys: {},
  model: {
    anthropic: '',
    openai: '',
    gemini: '',
    groq: '',
    deepseek: '',
    together: '',
    mistral: '',
    xai: '',
    fireworks: '',
    openrouter: '',
    ollama: '',
    native: '',
  },
  advanced: {
    promptTemplate: { system: 's', user: 'u' },
    perPresetTemplates: {},
    temperature: 0.2,
    maxTokens: 512,
  },
};

interface Session {
  emit: (msg: unknown) => void;
  unsubscribed: boolean;
}

function setupPortManager(): Session {
  const session: Session = { emit: () => {}, unsubscribed: false };
  portManagerMocks.send.mockImplementation((_frame, h) => {
    session.emit = (m: unknown) => h(m);
    return () => {
      session.unsubscribed = true;
    };
  });
  return session;
}

const mkImgArgs = (onChunk: (c: TranslationChunk) => void) => ({
  requestId: 'img-1',
  imageBase64: 'AAAA',
  mediaType: 'image/png',
  cancel: noopCancel(),
  config: baseConfig,
  onChunk,
});

describe('NativeBackend.translateImage first-frame watchdog', () => {
  beforeEach(() => {
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
    portManagerMocks.send.mockReset();
    portManagerMocks.cancel.mockReset();
  });

  it('fails fast when the host accepts the frame but never answers', async () => {
    vi.useFakeTimers();
    try {
      const sess = setupPortManager();
      const chunks: TranslationChunk[] = [];
      const p = new NativeBackend().translateImage(mkImgArgs((c) => chunks.push(c)));
      await vi.advanceTimersByTimeAsync(30_000);
      await p;
      const errs = chunks.filter((c) => c.type === 'error');
      expect(errs).toHaveLength(1);
      const err = errs[0];
      if (err?.type !== 'error') throw new Error('expected error chunk');
      expect(err.code).toBe('NATIVE_SPAWN_FAIL');
      // The host-side slot is canceled too, or a wedged CLI child stays occupied.
      expect(portManagerMocks.cancel).toHaveBeenCalledWith('img-1');
      expect(sess.unsubscribed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a first frame inside the deadline cancels the watchdog', async () => {
    vi.useFakeTimers();
    try {
      const sess = setupPortManager();
      const chunks: TranslationChunk[] = [];
      const p = new NativeBackend().translateImage(mkImgArgs((c) => chunks.push(c)));
      await vi.advanceTimersByTimeAsync(5_000);
      sess.emit({ v: 1, id: 'img-1', type: 'delta', text: '{"translation":"ok","confidence":1}' });
      sess.emit({ v: 1, id: 'img-1', type: 'done' });
      await vi.advanceTimersByTimeAsync(60_000);
      await p;
      expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
      expect(chunks.filter((c) => c.type === 'error')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
