import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OllamaBackend, ollama403Message } from '@/shared/backends/ollama';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import { shouldRotate } from '@/shared/error-policy';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Strip the leading `# ...` comment lines so the fixture matches the shape of
// a real HTTP response (the `#` comments are documentation in-file only).
const FIXTURE = readFileSync(join(__dirname, '..', '..', 'fixtures', 'ollama-stream.txt'), 'utf8')
  .split('\n')
  .filter((l) => !l.startsWith('#'))
  .join('\n');

const baseConfig = {
  apiKeys: {},
  model: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
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
    promptTemplate: { system: 's', user: 'u' },
    perPresetTemplates: {},
    temperature: 0.2,
    maxTokens: 1024,
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
  system: 'SYS',
  user: 'USER',
  stream: true,
  cancel: noopCancel(),
  onChunk: () => {},
  config: baseConfig,
  ...over,
});

function ndjson(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

describe('OllamaBackend', () => {
  it('has id "ollama"', () => {
    expect(new OllamaBackend().id).toBe('ollama');
  });

  it('isAvailable probes /api/tags only — true when daemon answers, false on failure', async () => {
    // No OPTIONS /api/chat preflight: it costs 5-50ms per probe, and a CORS misconfig surfaces on the real POST as a 403 → actionable AUTH error.
    const seen: string[] = [];
    setFetchHandler(async (url, init) => {
      seen.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/api/tags')) return new Response('{"models":[]}', { status: 200 });
      return new Response('nope', { status: 404 });
    });
    expect(await new OllamaBackend().isAvailable(baseConfig)).toBe(true);
    expect(seen.some((s) => s.includes('/api/tags'))).toBe(true);
    // Preflight is intentionally absent now.
    expect(seen.some((s) => s.startsWith('OPTIONS '))).toBe(false);

    setFetchHandler(async () => {
      throw new Error('connection refused');
    });
    expect(await new OllamaBackend().isAvailable(baseConfig)).toBe(false);
  });

  it('exposes translateImage as an optional TranslationBackend member', () => {
    // Ollama gates vision per model on its side, so the backend always exposes translateImage.
    const b: TranslationBackend = new OllamaBackend();
    expect(typeof b.translateImage).toBe('function');
  });

  it('hits /api/chat on the configured ollamaUrl with streaming + keep_alive', async () => {
    let hitUrl = '';
    let sentBody: Record<string, unknown> = {};
    setFetchHandler(async (url, init) => {
      hitUrl = url;
      sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return ndjson(FIXTURE);
    });
    await new OllamaBackend().translate(
      mkArgs({ config: { ...baseConfig, ollamaUrl: 'http://127.0.0.1:11434/' } }),
    );
    expect(hitUrl).toBe('http://127.0.0.1:11434/api/chat');
    expect(sentBody['model']).toBe('llama3.2');
    expect(sentBody['stream']).toBe(true);
    // `keep_alive` keeps the model resident across back-to-back
    // selections so we don't pay reload latency under cross-app GPU pressure.
    expect(sentBody['keep_alive']).toBe('30m');
    // No `format: 'json'`: Ollama's grammar sampler is 3-10x slower; the prompt asks for JSON and the parser handles drift.
    expect(sentBody['format']).toBeUndefined();
  });

  it('parses NDJSON captured fixture into deltas + done with parsed confidence', async () => {
    setFetchHandler(async () => ndjson(FIXTURE));
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const deltas = chunks.filter((c) => c.type === 'delta');
    const done = chunks.find((c) => c.type === 'done');
    expect(deltas.length).toBeGreaterThan(0);
    expect(done).toBeDefined();
    if (done?.type === 'done') {
      expect(done.confidence).toBeCloseTo(0.83, 2);
      expect(done.detectedLang).toBe('arabizi');
    }
  });

  it('defaults to http://localhost:11434 when no ollamaUrl is configured', async () => {
    let hitUrl = '';
    setFetchHandler(async (url) => {
      hitUrl = url;
      return ndjson(FIXTURE);
    });
    await new OllamaBackend().translate(mkArgs());
    expect(hitUrl).toBe('http://localhost:11434/api/chat');
  });

  it('falls back to the loopback default when a non-loopback ollamaUrl slips past the schema', async () => {
    let hitUrl = '';
    setFetchHandler(async (url) => {
      hitUrl = url;
      return ndjson(FIXTURE);
    });
    // Simulates a write path that bypassed the schema chokepoint — the sink
    // must self-defend and never compose a fetch to a non-loopback host.
    await new OllamaBackend().translate(
      mkArgs({ config: { ...baseConfig, ollamaUrl: 'http://169.254.169.254:11434' } }),
    );
    expect(hitUrl).toBe('http://localhost:11434/api/chat');
  });

  it('emits a terminal REQUEST error on a 404 model-not-pulled response', async () => {
    setFetchHandler(async () => new Response('model not found', { status: 404 }));
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('REQUEST');
      expect(err.message).toContain('ollama pull');
    }
  });

  it('emits actionable AUTH error with OLLAMA_ORIGINS fix on HTTP 403', async () => {
    // Ollama returns 403 when OLLAMA_ORIGINS isn't set to
    // allow chrome-extension:// origins. Surface the fix, not just the code.
    setFetchHandler(async () => new Response('forbidden', { status: 403 }));
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('AUTH');
      // Not the generic "Ollama HTTP 403: forbidden" — the actionable fix.
      expect(err.message).toBe(ollama403Message());
      expect(err.message).toContain('OLLAMA_ORIGINS');
      expect(err.message).toContain('chrome-extension://');
    }
  });

  it('emits actionable AUTH error when fetch throws a CORS-y TypeError', async () => {
    // A CORS rejection can arrive as a thrown TypeError instead of a 403; same message.
    setFetchHandler(async () => {
      throw new TypeError('Failed to fetch: origin not allowed by CORS policy');
    });
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('AUTH');
      expect(err.message).toBe(ollama403Message());
    }
  });

  it('emits TIMEOUT when the chat request signal times out', async () => {
    setFetchHandler(async () => {
      throw new Error('signal timed out');
    });
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('TIMEOUT');
      expect(err.message).toBe('The backend took too long to answer. Try again.');
    }
  });

  it('an in-stream error frame on the text path stays UNKNOWN and keeps the raw message', async () => {
    setFetchHandler(
      async () =>
        new Response('{"error":"context length exceeded"}\n', {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
        }),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type !== 'error') throw new Error('expected an error chunk');
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('context length exceeded');
  });

  it('a text-path error naming a vision model is not rewritten into the pull-a-vision hint', async () => {
    setFetchHandler(
      async () =>
        new Response('{"error":"model llama3.2-vision is loading"}\n', {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
        }),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type !== 'error') throw new Error('expected an error chunk');
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('model llama3.2-vision is loading');
    expect(err.message).not.toContain('llava');
  });
});

describe('OllamaBackend.translateImage (vision)', () => {
  const mkImgArgs = (
    over: Partial<Parameters<NonNullable<OllamaBackend['translateImage']>>[0]> = {},
  ) => ({
    requestId: 'img-1',
    imageBase64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    mediaType: 'image/png',
    cancel: noopCancel(),
    config: baseConfig,
    onChunk: () => {},
    ...over,
  });

  it('sends base64 image in messages[0].images and forwards the reply', async () => {
    let capturedBody: unknown = null;
    setFetchHandler(async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ message: { content: 'Hello world' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const chunks: TranslationChunk[] = [];
    const backend = new OllamaBackend();
    await backend.translateImage(mkImgArgs({ onChunk: (c: TranslationChunk) => chunks.push(c) }));
    const body = capturedBody as {
      messages: Array<{ role: string; content: string; images?: string[] }>;
      stream: boolean;
    };
    expect(body.messages[0]?.images?.[0]).toBe(mkImgArgs().imageBase64);
    expect(body.stream).toBe(false);
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
  });

  it('emits the whole answer as one delta, then done, like every non-stream path', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({ message: { content: '{"translation":"bonjour","confidence":0.9}' } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translateImage(
      mkImgArgs({ onChunk: (c: TranslationChunk) => chunks.push(c) }),
    );
    expect(chunks.map((c) => c.type)).toEqual(['delta', 'done']);
  });

  it('surfaces pull-a-vision-model hint when Ollama rejects non-vision model', async () => {
    setFetchHandler(
      async () =>
        new Response(JSON.stringify({ error: 'model does not support images' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const chunks: TranslationChunk[] = [];
    const backend = new OllamaBackend();
    await backend.translateImage(mkImgArgs({ onChunk: (c: TranslationChunk) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.code).toBe('UNSUPPORTED');
      expect(err.message).toContain('llava');
      expect(err.message).toContain('pull');
    }
  });

  it('maps HTTP 403 to AUTH with OLLAMA_ORIGINS fix', async () => {
    setFetchHandler(async () => new Response('forbidden', { status: 403 }));
    const chunks: TranslationChunk[] = [];
    const backend = new OllamaBackend();
    await backend.translateImage(mkImgArgs({ onChunk: (c: TranslationChunk) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('AUTH');
      expect(err.message).toBe(ollama403Message());
    } else {
      throw new Error('expected AUTH error');
    }
  });

  it('an empty image answer is SERVER, the same as the text path', async () => {
    setFetchHandler(
      async () =>
        new Response(JSON.stringify({ message: { content: '' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const chunks: TranslationChunk[] = [];
    const backend = new OllamaBackend();
    await backend.translateImage(mkImgArgs({ onChunk: (c: TranslationChunk) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('SERVER');
    } else {
      throw new Error('expected SERVER error');
    }
  });

  it('releases the response-body reader when an error frame ends the loop early', async () => {
    // An early return must cancel the reader, or the body lock holds the socket until GC.
    let cancelled = false;
    const enc = new TextEncoder();
    setFetchHandler(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          // Error frame triggers early `return` from the parsing loop.
          // The stream stays open after this enqueue — never `close()`d.
          c.enqueue(enc.encode('{"error":"context length exceeded"}\n'));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      });
    });
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type).toBe('error');
    expect(cancelled).toBe(true);
  });

  it('a 2xx body that is not JSON is SERVER, so the chain rotates to the next backend', async () => {
    setFetchHandler(
      async () =>
        new Response('<html>proxy says hello</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const chunks: TranslationChunk[] = [];
    await new OllamaBackend().translateImage(
      mkImgArgs({ onChunk: (c: TranslationChunk) => chunks.push(c) }),
    );
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type !== 'error') throw new Error('expected an error chunk');
    expect(err.code).toBe('SERVER');
    expect(shouldRotate(err.code)).toBe(true);
  });
});
