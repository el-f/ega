import { describe, it, expect, vi } from 'vitest';
import { LocalServerBackend, localServerBaseUrl } from '@/shared/backends/local-server';
import { DEFAULT_MODEL } from '@/shared/settings-schema';
import { resolveSamplingSupport } from '@/shared/backends/sampling-caps';
import { shouldRotate } from '@/shared/error-policy';
import { errorCopy } from '@/shared/error-copy';
import { sel } from '@tests/_helpers/lang';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import { sse } from '@tests/_helpers/backend';
import type { BackendConfig, TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const config = (over: Partial<BackendConfig> = {}): BackendConfig => ({
  apiKeys: { openai: 'sk-must-not-leak' },
  model: { ...DEFAULT_MODEL, localserver: 'qwen3-8b' },
  advanced: { temperature: 0.3, maxTokens: 777, effort: 'high' },
  ...over,
});

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
  config: config(),
  ...over,
});

const SSE = [
  'data: {"choices":[{"delta":{"content":"{\\"translation\\":\\"hello\\","}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"\\"confidence\\":0.9}"},"finish_reason":"stop"}]}\n\n',
  'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":7}}\n\n',
  'data: [DONE]\n\n',
].join('');

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

/** Records every request; /v1/models answers `models`, chat answers the SSE above. */
function record(models: unknown = { data: [{ id: 'listed-model' }] }): Seen[] {
  const seen: Seen[] = [];
  setFetchHandler(async (url, init) => {
    seen.push({
      method: init?.method ?? 'GET',
      url,
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });
    // LM Studio's own API is absent here, as on llama-server.
    if (url.includes('/api/v')) return new Response('', { status: 404 });
    if (url.endsWith('/v1/models')) return Response.json(models);
    return sse(SSE);
  });
  return seen;
}

function lastError(chunks: TranslationChunk[]) {
  const err = chunks.find((c) => c.type === 'error');
  if (err?.type !== 'error') throw new Error(`no error chunk: ${chunks.map((c) => c.type)}`);
  return err;
}

describe('LocalServerBackend', () => {
  it('is the keyless, vision-capable "localserver" backend', () => {
    const b = new LocalServerBackend();
    expect(b.id).toBe('localserver');
    expect(b.manifest.name).toBe('Local server (OpenAI-compatible)');
    expect(b.manifest.capabilities.canVision).toBe(true);
    expect(typeof b.translateImage).toBe('function');
  });

  describe('base URL', () => {
    it('defaults to LM Studio on 127.0.0.1:1234', () => {
      expect(localServerBaseUrl(undefined)).toBe('http://127.0.0.1:1234');
      expect(localServerBaseUrl('')).toBe('http://127.0.0.1:1234');
    });

    it('drops a trailing slash and the /v1 an OpenAI SDK base URL carries', () => {
      expect(localServerBaseUrl('http://localhost:8080/')).toBe('http://localhost:8080');
      expect(localServerBaseUrl(' http://127.0.0.1:8080/v1/ ')).toBe('http://127.0.0.1:8080');
    });

    it('falls back to the default for a non-loopback URL that slipped past the schema', () => {
      expect(localServerBaseUrl('http://169.254.169.254/v1')).toBe('http://127.0.0.1:1234');
      expect(localServerBaseUrl('http://192.168.1.5:1234')).toBe('http://127.0.0.1:1234');
    });
  });

  describe('request shape', () => {
    it('posts to {url}/v1/chat/completions with the settings and no auth or effort fields', async () => {
      const seen = record();
      await new LocalServerBackend().translate(
        mkArgs({
          config: config({ localServerUrl: 'http://127.0.0.1:8080' }),
          history: [
            { role: 'user', content: 'earlier' },
            { role: 'assistant', content: 'answer' },
          ],
        }),
      );
      expect(seen).toHaveLength(1);
      const [req] = seen;
      expect(req?.method).toBe('POST');
      expect(req?.url).toBe('http://127.0.0.1:8080/v1/chat/completions');
      expect(Object.keys(req?.headers ?? {}).map((h) => h.toLowerCase())).not.toContain(
        'authorization',
      );
      expect(req?.body).toEqual({
        model: 'qwen3-8b',
        messages: [
          { role: 'system', content: 'SYS' },
          { role: 'user', content: 'earlier' },
          { role: 'assistant', content: 'answer' },
          { role: 'user', content: 'USER' },
        ],
        stream: true,
        temperature: 0.3,
        max_tokens: 777,
        stream_options: { include_usage: true },
      });
    });

    it('streams deltas, usage and a parsed done', async () => {
      record();
      const chunks: TranslationChunk[] = [];
      await new LocalServerBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      const text = chunks.map((c) => (c.type === 'delta' ? c.text : '')).join('');
      expect(text).toBe('{"translation":"hello","confidence":0.9}');
      const done = chunks.at(-1);
      expect(done?.type).toBe('done');
      if (done?.type === 'done') {
        expect(done.confidence).toBe(0.9);
        expect(done.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
      }
    });

    it('sends no stream_options on a non-stream call', async () => {
      const seen: Array<Record<string, unknown>> = [];
      setFetchHandler(async (_url, init) => {
        seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({
          choices: [{ message: { content: '{"translation":"hi"}' }, finish_reason: 'stop' }],
        });
      });
      const chunks: TranslationChunk[] = [];
      await new LocalServerBackend().translate(
        mkArgs({ stream: false, onChunk: (c) => chunks.push(c) }),
      );
      expect(seen[0]?.['stream']).toBe(false);
      expect(seen[0]).not.toHaveProperty('stream_options');
      expect(chunks.at(-1)?.type).toBe('done');
    });

    it('with an empty model slot, runs the first chat model the server lists', async () => {
      const seen = record({
        data: [{ id: 'text-embedding-nomic-embed-text-v1.5' }, { id: 'google/gemma-4-e4b' }],
      });
      await new LocalServerBackend().translate(
        mkArgs({ config: config({ model: { ...DEFAULT_MODEL } }) }),
      );
      expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
        'GET http://127.0.0.1:1234/api/v1/models',
        'GET http://127.0.0.1:1234/api/v0/models',
        'GET http://127.0.0.1:1234/v1/models',
        'POST http://127.0.0.1:1234/v1/chat/completions',
      ]);
      expect(seen[2]?.headers).toEqual({});
      expect(seen[3]?.body?.['model']).toBe('google/gemma-4-e4b');
    });

    it('with an empty slot on LM Studio, runs the model it has loaded, not the first one downloaded', async () => {
      const seen: Seen[] = [];
      setFetchHandler(async (url, init) => {
        seen.push({
          method: init?.method ?? 'GET',
          url,
          headers: {},
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
        });
        // Shape from lmstudio.ai/docs/developer/rest/list: loaded_instances is empty for a model not loaded.
        if (url.endsWith('/api/v1/models')) {
          return Response.json({
            models: [
              { type: 'llm', key: 'deepseek/r1-distill', loaded_instances: [] },
              { type: 'embedding', key: 'nomic-embed', loaded_instances: [{ id: 'e' }] },
              { type: 'llm', key: 'qwen/qwen2.5-7b', loaded_instances: [{ id: 'q' }] },
            ],
          });
        }
        return sse(SSE);
      });
      await new LocalServerBackend().translate(
        mkArgs({ config: config({ model: { ...DEFAULT_MODEL } }) }),
      );
      expect(seen.map((r) => r.url)).not.toContain('http://127.0.0.1:1234/v1/models');
      expect(seen.at(-1)?.body?.['model']).toBe('qwen/qwen2.5-7b');
    });

    it('with an empty slot and no model list, sends no model field and lets the server pick', async () => {
      const seen: Seen[] = [];
      setFetchHandler(async (url, init) => {
        seen.push({
          method: init?.method ?? 'GET',
          url,
          headers: {},
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
        });
        if (url.endsWith('/models')) return new Response('nope', { status: 500 });
        return sse(SSE);
      });
      await new LocalServerBackend().translate(
        mkArgs({ config: config({ model: { ...DEFAULT_MODEL } }) }),
      );
      expect(seen.at(-1)?.body).not.toHaveProperty('model');
    });

    it('sends the image as OpenAI image_url content, with no response_format', async () => {
      const seen = record();
      await new LocalServerBackend().translateImage({
        requestId: 'img',
        imageBase64: 'AAAA',
        mediaType: 'image/png',
        system: 'OCR-SYS',
        user: 'OCR-USER',
        cancel: noopCancel(),
        onChunk: () => {},
        config: config(),
      });
      const body = seen[0]?.body ?? {};
      expect(body['stream']).toBe(true);
      expect(body).not.toHaveProperty('response_format');
      expect(body['messages']).toEqual([
        { role: 'system', content: 'OCR-SYS' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'OCR-USER' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ]);
    });

    it('takes no effort setting for any model name', () => {
      for (const model of ['', 'openai/gpt-oss-20b', 'gpt-5', 'qwen3-8b']) {
        expect(resolveSamplingSupport('localserver', model)).toEqual({
          temperature: true,
          maxTokens: true,
          efforts: [],
        });
      }
    });
  });

  describe('errors name the server and the fix', () => {
    it('an unreachable server says where and to start it, and lets the chain move on', async () => {
      setFetchHandler(async () => {
        throw new TypeError('Failed to fetch');
      });
      const chunks: TranslationChunk[] = [];
      await new LocalServerBackend().translate(
        mkArgs({
          config: config({ localServerUrl: 'http://localhost:8080' }),
          onChunk: (c) => chunks.push(c),
        }),
      );
      const err = lastError(chunks);
      expect(err.code).toBe('NETWORK');
      expect(err.message).toContain('http://localhost:8080');
      expect(err.message).toMatch(/start the server/i);
      expect(shouldRotate(err.code)).toBe(true);
    });

    it('a 401 says the server wants a key Ega does not send', async () => {
      setFetchHandler(async () => new Response('{"error":"Invalid API Key"}', { status: 401 }));
      const chunks: TranslationChunk[] = [];
      await new LocalServerBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      const err = lastError(chunks);
      expect(err.code).toBe('AUTH');
      expect(err.message).toContain('http://127.0.0.1:1234');
      expect(err.message).toMatch(/API key/);
    });

    it('a 404 names the URL and the model', async () => {
      setFetchHandler(async () => new Response('not found', { status: 404 }));
      const chunks: TranslationChunk[] = [];
      await new LocalServerBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      const err = lastError(chunks);
      expect(err.code).toBe('REQUEST');
      expect(err.message).toContain('http://127.0.0.1:1234');
      expect(err.message).toContain('"qwen3-8b"');
    });

    // Real wording: llama.cpp tools/server/server-context.cpp; lmstudio-bug-tracker #237 (0.3, HTTP 400) and #1757 (0.4.7).
    it.each([
      [
        'llama-server, a request over the context',
        {
          error: {
            code: 400,
            message:
              'request (12009 tokens) exceeds the available context size (8192 tokens), try increasing it',
            type: 'exceed_context_size_error',
            n_prompt_tokens: 12009,
            n_ctx: 8192,
          },
        },
      ],
      [
        'llama-server, a prompt over the whole context',
        {
          error: {
            code: 400,
            message:
              'input (9000 tokens) is larger than the max context size (8192 tokens). skipping',
            type: 'exceed_context_size_error',
          },
        },
      ],
      [
        'LM Studio 0.3',
        {
          error:
            '<LM Studio error> Trying to keep the first 15857 tokens when context the overflows. However, the model is loaded with context length of only 4096 tokens, which is not enough. Try to load the model with a larger context length, or provide a shorter input. Error Data: n/a, Additional Data: n/a',
        },
      ],
      ['LM Studio 0.4', { error: 'Context size has been exceeded.' }],
    ])('%s reads "Text too long", not "Request rejected"', async (_server, body) => {
      setFetchHandler(async () => Response.json(body, { status: 400 }));
      const chunks: TranslationChunk[] = [];
      await new LocalServerBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      const err = lastError(chunks);
      expect(err.code).toBe('REQUEST');
      expect(err.message).toMatch(/^The request was too long\. Select less text\.\n/);
      expect(errorCopy(err.code, err.message)?.id).toBe('REQUEST_TOO_LONG');
    });

    it('a server error names the server in the provider line', async () => {
      setFetchHandler(async () =>
        Response.json({ error: { message: 'Model is loading' } }, { status: 503 }),
      );
      const chunks: TranslationChunk[] = [];
      await new LocalServerBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
      const err = lastError(chunks);
      expect(err.code).toBe('SERVER');
      expect(err.message).toContain(
        'Local server at http://127.0.0.1:1234 HTTP 503: Model is loading',
      );
    });

    it('a text-only model answering the image call is UNSUPPORTED with the model named', async () => {
      for (const res of [
        () => new Response('{"error":{"message":"image input is not supported"}}', { status: 501 }),
        () => new Response('{"error":"Model does not support images"}', { status: 400 }),
      ]) {
        setFetchHandler(async () => res());
        const chunks: TranslationChunk[] = [];
        await new LocalServerBackend().translateImage({
          requestId: 'img',
          imageBase64: 'AAAA',
          mediaType: 'image/png',
          cancel: noopCancel(),
          onChunk: (c) => chunks.push(c),
          config: config(),
        });
        const err = lastError(chunks);
        expect(err.code).toBe('UNSUPPORTED');
        expect(err.message).toContain('"qwen3-8b"');
        expect(err.message).toMatch(/cannot read images/);
      }
    });
  });

  describe('isAvailable', () => {
    it('GETs {url}/v1/models with no auth header and is true on 2xx', async () => {
      const seen = record();
      expect(await new LocalServerBackend().isAvailable(config())).toBe(true);
      expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
        'GET http://127.0.0.1:1234/v1/models',
      ]);
      expect(seen[0]?.headers).toEqual({});
    });

    it('is false on a non-2xx answer and on a refused connection', async () => {
      setFetchHandler(async () => new Response('', { status: 404 }));
      expect(await new LocalServerBackend().isAvailable(config())).toBe(false);
      setFetchHandler(async () => {
        throw new TypeError('Failed to fetch');
      });
      expect(await new LocalServerBackend().isAvailable(config())).toBe(false);
    });

    it('waits the local backend timeout, 800 ms unless Settings changes it', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      setFetchHandler(async () => new Response('{}', { status: 200 }));
      await new LocalServerBackend().isAvailable(config({ localBackendTimeoutMs: 1234 }));
      await new LocalServerBackend().isAvailable(config());
      expect(timeout.mock.calls.map((c) => c[0])).toEqual([1234, 800]);
      timeout.mockRestore();
    });
  });

  describe('discoverModels', () => {
    it('lists the chat model ids, without the embedding models and with no auth header', async () => {
      const seen = record({
        data: [{ id: 'qwen3-8b' }, { id: 'text-embedding-nomic-embed-text-v1.5' }, { id: 'gemma' }],
      });
      expect(
        await new LocalServerBackend().discoverModels(
          config({ localServerUrl: 'http://127.0.0.1:8080/v1' }),
        ),
      ).toEqual(['qwen3-8b', 'gemma']);
      expect(seen[0]?.url).toBe('http://127.0.0.1:8080/v1/models');
      expect(seen[0]?.headers).toEqual({});
    });

    it('throws on an HTTP error so the card can show it', async () => {
      setFetchHandler(async () => new Response('', { status: 500, statusText: 'Server Error' }));
      await expect(new LocalServerBackend().discoverModels(config())).rejects.toThrow('HTTP 500');
    });
  });
});
