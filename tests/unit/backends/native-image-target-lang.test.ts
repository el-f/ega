import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeBackend } from '@/shared/backends/native';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateImageArgs } from '@/shared/backends/base';
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
  cancel: vi.fn(),
  ping: vi.fn<(timeoutMs: number) => Promise<boolean>>(),
  getStatus: vi.fn(() => 'cold' as const),
  _resetForTest: vi.fn(),
}));

vi.mock('@/shared/cli-session/port-manager', () => portManagerMocks);

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

interface Session {
  frames: Array<Record<string, unknown>>;
  emit: (msg: unknown) => void;
}

function setupPortManager(): Session {
  const session: Session = { frames: [], emit: () => {} };
  portManagerMocks.send.mockImplementation((frame, h) => {
    session.frames.push(frame);
    session.emit = (m: unknown) => h(m);
    return () => {};
  });
  return session;
}

const IMG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('NativeBackend.translateImage — target language prompt', () => {
  beforeEach(() => {
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
  });

  it('uses system/user from args when provided, not the hardcoded English prompt', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];

    const args: TranslateImageArgs = {
      requestId: 'img-fr',
      imageBase64: IMG_BASE64,
      mediaType: 'image/png',
      cancel: noopCancel(),
      config: baseConfig,
      onChunk: (c) => chunks.push(c),
      system: 'French-aware system prompt',
      user: 'Translate into French. Extract any visible text.',
    };

    const p = b.translateImage(args);
    sess.emit({ v: 1, id: 'img-fr', type: 'done' });
    await p;

    const posted = sess.frames[0] as Record<string, unknown>;
    const prompt = posted['prompt'] as { system: string; user: string };
    expect(prompt.system).toBe('French-aware system prompt');
    expect(prompt.user).toBe('Translate into French. Extract any visible text.');
  });

  it('falls back to English hardcoded prompt when system/user not provided', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();

    const args: TranslateImageArgs = {
      requestId: 'img-default',
      imageBase64: IMG_BASE64,
      mediaType: 'image/png',
      cancel: noopCancel(),
      config: baseConfig,
      onChunk: () => {},
    };

    const p = b.translateImage(args);
    sess.emit({ v: 1, id: 'img-default', type: 'done' });
    await p;

    const posted = sess.frames[0] as Record<string, unknown>;
    const prompt = posted['prompt'] as { user: string };
    expect(prompt.user).toContain('translate');
    expect(prompt.user.toLowerCase()).toContain('english');
  });
});
