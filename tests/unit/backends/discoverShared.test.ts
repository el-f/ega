import { describe, it, expect, beforeEach } from 'vitest';
import { setFetchHandler, clearFetchHandler } from '../../mocks/fetch';
import { fetchOpenAICompatibleModels } from '@/shared/backends/discoverShared';

beforeEach(() => clearFetchHandler());

describe('fetchOpenAICompatibleModels', () => {
  it('returns the list of model ids from a 200 response', async () => {
    setFetchHandler(
      async () =>
        new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }), {
          status: 200,
        }),
    );
    const ids = await fetchOpenAICompatibleModels('https://api.openai.com/v1/models', 'sk-test');
    expect(ids).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('throws on 401 with the status code in the message', async () => {
    setFetchHandler(async () => new Response('nope', { status: 401, statusText: 'Unauthorized' }));
    await expect(
      fetchOpenAICompatibleModels('https://api.openai.com/v1/models', 'bad-key'),
    ).rejects.toThrow(/HTTP 401/);
  });

  it('throws on 403', async () => {
    setFetchHandler(async () => new Response('forbidden', { status: 403 }));
    await expect(
      fetchOpenAICompatibleModels('https://api.example.com/v1/models', 'sk-test'),
    ).rejects.toThrow(/HTTP 403/);
  });

  it('returns empty array when body.data is missing', async () => {
    setFetchHandler(async () => new Response(JSON.stringify({}), { status: 200 }));
    const ids = await fetchOpenAICompatibleModels('https://api.example.com/v1/models', 'sk-test');
    expect(ids).toEqual([]);
  });

  it('returns empty array when body.data is an empty array', async () => {
    setFetchHandler(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const ids = await fetchOpenAICompatibleModels('https://api.example.com/v1/models', 'sk-test');
    expect(ids).toEqual([]);
  });

  it('drops entries with non-string or empty id', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'real-1' },
              { id: '' },
              { id: 42 },
              { id: null },
              {/* missing id */},
              { id: 'real-2' },
            ],
          }),
          { status: 200 },
        ),
    );
    const ids = await fetchOpenAICompatibleModels('https://api.example.com/v1/models', 'sk-test');
    expect(ids).toEqual(['real-1', 'real-2']);
  });

  it('applies the optional filter (used by OpenAI to drop non-chat ids)', async () => {
    setFetchHandler(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'gpt-4o' },
              { id: 'text-embedding-3-small' },
              { id: 'tts-1' },
              { id: 'gpt-4o-mini' },
            ],
          }),
          { status: 200 },
        ),
    );
    const ids = await fetchOpenAICompatibleModels(
      'https://api.openai.com/v1/models',
      'sk-test',
      (id) => /^gpt-/i.test(id),
    );
    expect(ids).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('sends the Authorization header with the supplied key', async () => {
    let capturedAuth: string | null = null;
    setFetchHandler(async (input, init) => {
      const headers = new Headers(init?.headers ?? {});
      capturedAuth = headers.get('Authorization');
      void input;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    await fetchOpenAICompatibleModels('https://api.example.com/v1/models', 'sk-secret');
    expect(capturedAuth).toBe('Bearer sk-secret');
  });
});
