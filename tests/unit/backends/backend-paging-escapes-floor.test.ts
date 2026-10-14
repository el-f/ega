import { describe, it, expect } from 'vitest';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { createMemoizedJsonParser, parseJsonResponse } from '@/shared/backends/base';
import { geminiMaxOutputTokens } from '@/shared/backends/gemini';
import { setFetchHandler } from '@tests/mocks/fetch';
import type { BackendConfig } from '@/shared/backends/base';

describe('Anthropic discoverModels follows has_more', () => {
  it('collects every page and asks for the next one after the last id', async () => {
    const urls: string[] = [];
    setFetchHandler(async (url) => {
      const u = new URL(String(url));
      urls.push(u.search);
      if (u.searchParams.get('after_id') === 'm2') {
        return Response.json({ data: [{ id: 'm3' }], has_more: false, last_id: 'm3' });
      }
      return Response.json({ data: [{ id: 'm1' }, { id: 'm2' }], has_more: true, last_id: 'm2' });
    });
    const cfg = { apiKeys: { anthropic: 'sk-ant-test' } } as unknown as BackendConfig;
    await expect(new AnthropicBackend().discoverModels(cfg)).resolves.toEqual(['m1', 'm2', 'm3']);
    expect(urls).toEqual(['?limit=1000', '?limit=1000&after_id=m2']);
  });

  it('stops after one page when the server says there is no more', async () => {
    let calls = 0;
    setFetchHandler(async () => {
      calls++;
      return Response.json({ data: [{ id: 'only' }], has_more: false });
    });
    const cfg = { apiKeys: { anthropic: 'sk-ant-test' } } as unknown as BackendConfig;
    await expect(new AnthropicBackend().discoverModels(cfg)).resolves.toEqual(['only']);
    expect(calls).toBe(1);
  });
});

describe('a \\uXXXX escape inside a partial translation', () => {
  it('decodes in the one-shot extraction of a truncated body', () => {
    const body = '{"translation":"\\u0645\\u0631\\u062d';
    expect(parseJsonResponse(body).translation).toBe('مرح');
  });

  it('drops a truncated escape instead of printing its digits', () => {
    expect(parseJsonResponse('{"translation":"ab\\u06').translation).toBe('ab');
  });

  it('decodes across deltas in the streaming scan, waiting for all four digits', () => {
    const parse = createMemoizedJsonParser();
    expect(parse('{"translation":"\\u06').translation).toBe('');
    expect(parse('{"translation":"\\u0645\\u0').translation).toBe('م');
    expect(parse('{"translation":"\\u0645\\u0631 x"}').translation).toBe('مر x');
  });

  it('treats an escape with bad digits like any other unknown escape', () => {
    expect(parseJsonResponse('{"translation":"a\\uzzzz b"}').translation).toBe('auzzzz b');
  });
});

describe('Gemini maxOutputTokens floor', () => {
  it('applies the same 4096 floor to text and image requests', () => {
    expect(geminiMaxOutputTokens(100)).toBe(4096);
    expect(geminiMaxOutputTokens(8192)).toBe(8192);
  });
});
