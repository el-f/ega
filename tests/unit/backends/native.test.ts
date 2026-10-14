import { readBackendAnswer } from '@tests/_helpers/backend';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NativeBackend } from '@/shared/backends/native';
import { createCancelToken } from '@/shared/cancel-token';
import { sel } from '@tests/_helpers/lang';
import { cancelFromSignal, noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

type FrameHandler = (msg: unknown) => void;
type DisconnectHandler = (reason?: string) => void;

const portManagerMocks = vi.hoisted(() => {
  const send =
    vi.fn<
      (
        frame: Record<string, unknown>,
        handler: (msg: unknown) => void,
        onDisconnect?: (reason?: string) => void,
      ) => () => void
    >();
  return {
    send,
    cancel: vi.fn<(id: string) => void>(),
    ping: vi.fn<(timeoutMs: number) => Promise<boolean>>(),
    getStatus: vi.fn(() => 'cold' as const),
    resetPortManagerForTest: vi.fn(),
  };
});

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
    localserver: '',
    native: '',
  },
  advanced: {
    promptTemplate: { system: '', user: '' },
    perPresetTemplates: {},
    temperature: 0,
    maxTokens: 1,
  },
};

const mkArgs = (over: Partial<TranslateCallArgs> = {}): TranslateCallArgs => ({
  req: {
    id: 'r1',
    text: 'hi',
    sourceLang: sel('arabizi'),
    targetLang: sel('en'),
    options: { stream: true, explain: false },
  },
  system: 'S',
  user: 'U',
  stream: true,
  cancel: noopCancel(),
  onChunk: () => {},
  config: baseConfig,
  ...over,
});

interface PortManagerSession {
  emit: (msg: unknown) => void;
  emitDisconnect: (reason?: string) => void;
  frames: Array<Record<string, unknown>>;
  handler: FrameHandler;
  disconnectHandler: DisconnectHandler | undefined;
  unsubscribed: boolean;
}

function setupPortManager(): PortManagerSession {
  const session: PortManagerSession = {
    frames: [],
    handler: () => {},
    disconnectHandler: undefined,
    emit: () => {},
    emitDisconnect: () => {},
    unsubscribed: false,
  };
  portManagerMocks.send.mockImplementation((frame, h, onDisconnect) => {
    session.frames.push(frame);
    session.handler = h;
    session.disconnectHandler = onDisconnect;
    session.emit = (m: unknown) => h(m);
    session.emitDisconnect = (reason?: string) => onDisconnect?.(reason);
    return () => {
      session.unsubscribed = true;
    };
  });
  portManagerMocks.cancel.mockReset();
  return session;
}

describe('NativeBackend', () => {
  beforeEach(() => {
    // @types/chrome 0.1.40+ marks lastError readonly; reset by deleting
    // the property (assigning undefined is blocked by exactOptionalPropertyTypes).
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
    portManagerMocks.send.mockReset();
    portManagerMocks.cancel.mockReset();
    portManagerMocks.ping.mockReset();
  });

  it('isAvailable delegates to port-manager ping (no raw connectNative)', async () => {
    portManagerMocks.ping.mockResolvedValue(true);
    const b = new NativeBackend();
    expect(await b.isAvailable(baseConfig)).toBe(true);
    expect(portManagerMocks.ping).toHaveBeenCalledTimes(1);
    expect((chrome.runtime.connectNative as unknown as Mock).mock.calls.length).toBe(0);
  });

  it('isAvailable forwards localBackendTimeoutMs to ping', async () => {
    portManagerMocks.ping.mockResolvedValue(true);
    const b = new NativeBackend();
    await b.isAvailable({ ...baseConfig, localBackendTimeoutMs: 1234 });
    expect(portManagerMocks.ping).toHaveBeenCalledWith(1234);
  });

  it('isAvailable returns false when ping returns false (host silent / disconnected)', async () => {
    portManagerMocks.ping.mockResolvedValue(false);
    const b = new NativeBackend();
    expect(await b.isAvailable(baseConfig)).toBe(false);
  });

  it('translates by sending the frame and aggregating delta messages via port-manager', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    expect(portManagerMocks.send).toHaveBeenCalledTimes(1);
    const sent = sess.frames[0];
    expect(sent?.['kind']).toBe('translate');
    expect(sent?.['id']).toBe('r1');
    sess.emit({ v: 1, id: 'r1', type: 'delta', text: '{"translation":"hello",' });
    sess.emit({ v: 1, id: 'r1', type: 'delta', text: '"confidence":0.91}' });
    sess.emit({ v: 1, id: 'r1', type: 'done' });
    await p;
    expect(chunks.filter((c) => c.type === 'delta')).toHaveLength(2);
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' && readBackendAnswer(chunks)['confidence']).toBeCloseTo(0.91, 2);
    expect(sess.unsubscribed).toBe(true);
  });

  it('passes the token usage the host reports on done, and drops a malformed one', async () => {
    const run = async (usage: unknown): Promise<unknown> => {
      const sess = setupPortManager();
      const chunks: TranslationChunk[] = [];
      const p = new NativeBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      sess.emit({ v: 1, id: 'r1', type: 'delta', text: '{"translation":"hello"}' });
      sess.emit({ v: 1, id: 'r1', type: 'done', usage });
      await p;
      const done = chunks.find((c) => c.type === 'done');
      return done?.type === 'done' ? done.usage : 'no done';
    };
    expect(await run({ inputTokens: 12, outputTokens: 7, cacheReadTokens: 3400 })).toEqual({
      inputTokens: 12,
      outputTokens: 7,
      cacheReadTokens: 3400,
    });
    expect(await run({ inputTokens: 'lots', outputTokens: 5 })).toEqual({ outputTokens: 5 });
    expect(await run('garbage')).toBeUndefined();
  });

  it('ignores frames for a different request id (id-scoped listener)', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    sess.emit({ v: 1, id: 'other', type: 'delta', text: 'ignored' });
    sess.emit({ v: 1, id: 'other', type: 'done' });
    sess.emit({ v: 1, id: 'r1', type: 'delta', text: '{"translation":"ok","confidence":1}' });
    sess.emit({ v: 1, id: 'r1', type: 'done' });
    await p;
    expect(chunks.filter((c) => c.type === 'delta')).toHaveLength(1);
  });

  // A dead host (CLI crash, host crash, service-worker reload) must end the request, not wait for the 60s wall clock.
  it('surfaces NATIVE_SPAWN_FAIL when the port disconnects mid-translate', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    // Confirm the disconnect handler was registered (would be undefined
    // on a backend that forgot to pass the 3rd arg to sendNativeFrame).
    expect(sess.disconnectHandler).toBeTypeOf('function');
    sess.emitDisconnect();
    await p;
    const errChunks = chunks.filter((c) => c.type === 'error');
    expect(errChunks).toHaveLength(1);
    const err = errChunks[0];
    if (err?.type !== 'error') throw new Error('expected error chunk');
    expect(err.code).toBe('NATIVE_SPAWN_FAIL');
    expect(err.message).toMatch(/disconnected/i);
    expect(sess.unsubscribed).toBe(true);
  });

  it('a successful done before disconnect ignores the late disconnect signal', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    sess.emit({ v: 1, id: 'r1', type: 'delta', text: '{"translation":"ok","confidence":1}' });
    sess.emit({ v: 1, id: 'r1', type: 'done' });
    sess.emitDisconnect();
    await p;
    expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
    expect(chunks.filter((c) => c.type === 'error')).toHaveLength(0);
  });

  // A host that answers ping but never the translate frame would hang the turn; the first-frame watchdog fails it fast.
  it('surfaces NATIVE_SPAWN_FAIL when the host never sends a frame (first-frame watchdog)', async () => {
    vi.useFakeTimers();
    try {
      const sess = setupPortManager();
      const b = new NativeBackend();
      const chunks: TranslationChunk[] = [];
      const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      expect(sess.frames).toHaveLength(1); // frame went out
      await vi.advanceTimersByTimeAsync(30_000); // host stays silent, no disconnect
      await p;
      const errChunks = chunks.filter((c) => c.type === 'error');
      expect(errChunks).toHaveLength(1);
      const err = errChunks[0];
      if (err?.type !== 'error') throw new Error('expected error chunk');
      expect(err.code).toBe('NATIVE_SPAWN_FAIL');
      expect(sess.unsubscribed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the first-frame watchdog also cancels host-side so a wedged slot is freed', async () => {
    vi.useFakeTimers();
    try {
      const sess = setupPortManager();
      const b = new NativeBackend();
      const p = b.translate(mkArgs());
      await vi.advanceTimersByTimeAsync(30_000);
      await p;
      expect(portManagerMocks.cancel).toHaveBeenCalledWith('r1');
      expect(sess.unsubscribed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a first frame within the deadline cancels the watchdog (slow host still completes)', async () => {
    vi.useFakeTimers();
    try {
      const sess = setupPortManager();
      const b = new NativeBackend();
      const chunks: TranslationChunk[] = [];
      const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      await vi.advanceTimersByTimeAsync(5_000); // cold-start delay, under the deadline
      sess.emit({ v: 1, id: 'r1', type: 'delta', text: '{"translation":"ok","confidence":1}' });
      sess.emit({ v: 1, id: 'r1', type: 'done' });
      await vi.advanceTimersByTimeAsync(60_000); // well past the deadline — must not fire
      await p;
      expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
      expect(chunks.filter((c) => c.type === 'error')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('translate onAbort invokes port-manager cancel with the request id', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const ctrl = new AbortController();
    const chunks: TranslationChunk[] = [];
    const p = b.translate(
      mkArgs({ cancel: cancelFromSignal(ctrl.signal), onChunk: (c) => chunks.push(c) }),
    );
    expect(sess.frames).toHaveLength(1);
    ctrl.abort();
    await p;
    expect(portManagerMocks.cancel).toHaveBeenCalledWith('r1');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' && err.code).toBe('ABORTED');
    expect(sess.unsubscribed).toBe(true);
  });

  it('translate short-circuits when the signal is already aborted', async () => {
    setupPortManager();
    const b = new NativeBackend();
    const ctrl = new AbortController();
    ctrl.abort();
    const chunks: TranslationChunk[] = [];
    await b.translate(
      mkArgs({ cancel: cancelFromSignal(ctrl.signal), onChunk: (c) => chunks.push(c) }),
    );
    expect(portManagerMocks.send).not.toHaveBeenCalled();
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' && err.code).toBe('ABORTED');
  });

  it('translate swallows warn frames without finishing the stream', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    sess.emit({ v: 1, id: 'r1', type: 'warn', code: 'TOOL_USE', message: 'tool used' });
    sess.emit({ v: 1, id: 'r1', type: 'delta', text: '{"translation":"ok","confidence":1}' });
    sess.emit({ v: 1, id: 'r1', type: 'done' });
    await p;
    const errs = chunks.filter((c) => c.type === 'error');
    expect(errs).toHaveLength(0);
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
  });

  it('translate forwards config.model.native as `model` field when present', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const cfg = { ...baseConfig, model: { ...baseConfig.model, native: 'claude-opus-4-7' } };
    const p = b.translate(mkArgs({ config: cfg }));
    sess.emit({ v: 1, id: 'r1', type: 'done' });
    await p;
    const posted = sess.frames[0] as Record<string, unknown>;
    expect(posted['model']).toBe('claude-opus-4-7');
  });

  it('translate trims a padded model slot, so the CLI runs the model the request log names', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const cfg = { ...baseConfig, model: { ...baseConfig.model, native: ' opus ' } };
    const p = b.translate(mkArgs({ config: cfg }));
    sess.emit({ v: 1, id: 'r1', type: 'done' });
    await p;
    expect((sess.frames[0] as Record<string, unknown>)['model']).toBe('opus');
  });

  it('translate omits `model` field when config.model.native is empty', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const p = b.translate(mkArgs());
    sess.emit({ v: 1, id: 'r1', type: 'done' });
    await p;
    const posted = sess.frames[0] as Record<string, unknown>;
    expect('model' in posted).toBe(false);
  });

  it.each([
    [undefined, true],
    ['claude', true],
    ['codex', false],
  ] as const)(
    'a claude AUTH error names a Claude Code update as a cause (nativeCli %s)',
    async (cli, hinted) => {
      const sess = setupPortManager();
      const b = new NativeBackend();
      const chunks: TranslationChunk[] = [];
      const config = cli ? { ...baseConfig, nativeCli: cli } : baseConfig;
      const p = b.translate(mkArgs({ config, onChunk: (c) => chunks.push(c) }));
      sess.emit({ v: 1, id: 'r1', type: 'error', code: 'AUTH', message: 'Not logged in.' });
      await p;
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' && err.message.startsWith('Not logged in.')).toBe(true);
      expect(err?.type === 'error' && /Claude Code update/.test(err.message)).toBe(hinted);
    },
  );

  it('a claude error that is not AUTH keeps the host message as is', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    sess.emit({ v: 1, id: 'r1', type: 'error', code: 'QUOTA', message: 'Out.' });
    await p;
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' && err.message).toBe('Out.');
  });

  // Every code the host emits; a code missing from ALL_ERR_CODES would turn into UNKNOWN here.
  it.each([
    'PARSE',
    'PROTOCOL',
    'TIMEOUT',
    'AUTH',
    'QUOTA',
    'RATE_LIMIT',
    'REQUEST',
    'SERVER',
    'NETWORK',
    'NATIVE_SPAWN_FAIL',
    'UNSUPPORTED',
  ] as const)('preserves the %s error code from a host frame', async (code) => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    sess.emit({ v: 1, id: 'r1', type: 'error', code, message: 'host said no' });
    await p;
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' && err.code).toBe(code);
  });
});

describe('NativeBackend.translateImage (vision)', () => {
  beforeEach(() => {
    // @types/chrome marks lastError readonly — delete the property to reset it.
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
    portManagerMocks.send.mockReset();
    portManagerMocks.cancel.mockReset();
  });

  const mkImgArgs = () => ({
    requestId: 'img-1',
    imageBase64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    mediaType: 'image/png',
    cancel: noopCancel(),
    config: baseConfig,
    onChunk: () => {},
  });

  it('sends the translateImage frame over the SHARED port (no private connectNative)', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const args = mkImgArgs();
    const p = b.translateImage(args);
    sess.emit({ v: 1, id: 'img-1', type: 'delta', text: 'Hello' });
    sess.emit({ v: 1, id: 'img-1', type: 'done' });
    await p;

    expect((chrome.runtime.connectNative as unknown as Mock).mock.calls.length).toBe(0);
    expect(portManagerMocks.send).toHaveBeenCalledTimes(1);
    const posted = sess.frames[0] as Record<string, unknown>;
    expect(posted['kind']).toBe('translateImage');
    expect(posted['id']).toBe('img-1');
    expect(posted['imageBase64']).toBe(args.imageBase64);
    expect(posted['mediaType']).toBe('image/png');
    const prompt = posted['prompt'] as { user: string };
    expect(prompt.user).toContain('translate');
    expect(sess.unsubscribed).toBe(true);
  });

  it('aggregates delta frames and emits a done chunk with the parsed payload', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translateImage({
      ...mkImgArgs(),
      onChunk: (c: TranslationChunk) => chunks.push(c),
    });
    sess.emit({ v: 1, id: 'img-1', type: 'delta', text: 'Hello ' });
    sess.emit({ v: 1, id: 'img-1', type: 'delta', text: 'world' });
    sess.emit({ v: 1, id: 'img-1', type: 'done' });
    await p;
    const deltas = chunks.filter((c) => c.type === 'delta');
    expect(deltas).toHaveLength(2);
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
  });

  it('maps host error frame to an error chunk with the reported code', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translateImage({
      ...mkImgArgs(),
      onChunk: (c: TranslationChunk) => chunks.push(c),
    });
    sess.emit({ v: 1, id: 'img-1', type: 'error', code: 'UNSUPPORTED', message: 'codex path' });
    await p;
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('UNSUPPORTED');
      expect(err.message).toBe('codex path');
    }
  });

  it('translateImage forwards config.model.native as `model` field when present', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const cfg = { ...baseConfig, model: { ...baseConfig.model, native: 'claude-opus-4-7' } };
    const p = b.translateImage({ ...mkImgArgs(), config: cfg });
    sess.emit({ v: 1, id: 'img-1', type: 'done' });
    await p;
    const posted = sess.frames[0] as Record<string, unknown>;
    expect(posted['model']).toBe('claude-opus-4-7');
  });

  it('emits ABORTED and cancels host-side when the AbortSignal fires mid-flight', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const ctrl = new AbortController();
    const chunks: TranslationChunk[] = [];
    const p = b.translateImage({
      ...mkImgArgs(),
      cancel: cancelFromSignal(ctrl.signal),
      onChunk: (c: TranslationChunk) => chunks.push(c),
    });
    ctrl.abort();
    await p;
    expect(portManagerMocks.cancel).toHaveBeenCalledWith('img-1');
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') expect(err.code).toBe('ABORTED');
    else throw new Error('expected ABORTED');
    expect(sess.unsubscribed).toBe(true);
  });

  it('a port disconnect with a not-found reason maps to NATIVE_NOT_INSTALLED', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const chunks: TranslationChunk[] = [];
    const p = b.translateImage({
      ...mkImgArgs(),
      onChunk: (c: TranslationChunk) => chunks.push(c),
    });
    sess.emitDisconnect('Specified native messaging host not found.');
    await p;
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error chunk');
    expect(err.code).toBe('NATIVE_NOT_INSTALLED');
  });

  it('removes the abort listener from the signal when done path fires', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const { token } = createCancelToken();
    const removeSpy = vi.spyOn(token.signal, 'removeEventListener');
    const p = b.translateImage({ ...mkImgArgs(), cancel: token });
    sess.emit({ v: 1, id: 'img-1', type: 'done' });
    await p;
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('removes the abort listener from the signal when error path fires', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    const { token } = createCancelToken();
    const removeSpy = vi.spyOn(token.signal, 'removeEventListener');
    const p = b.translateImage({ ...mkImgArgs(), cancel: token });
    sess.emit({ v: 1, id: 'img-1', type: 'error', code: 'UNSUPPORTED', message: 'no vision' });
    await p;
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('NativeBackend — history and idle guard', () => {
  it('folds prior turns into the user prompt, oldest first, before the new message', async () => {
    const sess = setupPortManager();
    const b = new NativeBackend();
    void b.translate(
      mkArgs({
        history: [
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'first answer' },
        ],
        user: 'follow-up',
      }),
    );
    const frame = sess.frames[0] as { prompt?: { user?: string } } | undefined;
    const user = frame?.prompt?.user ?? '';
    expect(user.indexOf('first question')).toBeGreaterThan(-1);
    expect(user.indexOf('first answer')).toBeGreaterThan(user.indexOf('first question'));
    expect(user.indexOf('follow-up')).toBeGreaterThan(user.indexOf('first answer'));
  });

  it('a host that answers a warn frame and then goes quiet fails after the idle budget, not the wallclock', async () => {
    vi.useFakeTimers();
    try {
      const sess = setupPortManager();
      const b = new NativeBackend();
      const chunks: TranslationChunk[] = [];
      const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      sess.emit({ v: 1, id: 'r1', type: 'warn', code: 'TOOL_USE', message: 'tool call' });
      await vi.advanceTimersByTimeAsync(30_000 + 1);
      await p;
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' && err.code).toBe('TIMEOUT');
    } finally {
      vi.useRealTimers();
    }
  });

  it('alive frames keep a slow CLI request open past the first-frame and idle limits', async () => {
    vi.useFakeTimers();
    try {
      const sess = setupPortManager();
      const b = new NativeBackend();
      const chunks: TranslationChunk[] = [];
      const p = b.translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      for (let i = 0; i < 6; i++) {
        await vi.advanceTimersByTimeAsync(10_000);
        sess.emit({ v: 1, id: 'r1', type: 'alive' });
      }
      expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
      sess.emit({ v: 1, id: 'r1', type: 'delta', text: '{"translation":"hola"}' });
      sess.emit({ v: 1, id: 'r1', type: 'done' });
      await p;
      expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
