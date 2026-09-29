import { describe, it, expect } from 'vitest';
import { GeminiBackend } from '@/shared/backends/gemini';
import { setFetchHandler } from '@tests/mocks/fetch';
import { sel } from '@tests/_helpers/lang';
import { noopCancel } from '@tests/_helpers/cancel';
import type { TranslateCallArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const baseConfig = {
  apiKeys: { gemini: 'g-key' },
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

async function errorFor(status: number, bodyText: string): Promise<string> {
  setFetchHandler(async () => new Response(bodyText, { status }));
  const chunks: TranslationChunk[] = [];
  await new GeminiBackend().translate(mkArgs({ onChunk: (c) => chunks.push(c) }));
  const err = chunks.find((c) => c.type === 'error');
  if (err?.type !== 'error') throw new Error('expected error chunk');
  return err.message;
}

describe('Gemini error-body is bounded and sanitized', () => {
  it('caps the surfaced upstream body tail (no unbounded HTML/binary wall)', async () => {
    const wall = 'X'.repeat(5000);
    const msg = await errorFor(400, wall);
    // The message must stay short — the prefix ("Gemini HTTP 400: ") plus a
    // bounded tail, never the whole 5000-char body.
    expect(msg.length).toBeLessThan(300);
    expect(msg).toContain('400');
  });

  it('strips control characters and collapses whitespace in the surfaced body', async () => {
    const noisy = '{"error":{"message":"bad\\n\\r\\trequest  detail "}}';
    const msg = await errorFor(400, noisy);
    // No raw newline / CR / tab / other control char leaks into the toast.
    // eslint-disable-next-line no-control-regex
    expect(msg).not.toMatch(/[\n\r\t\x00-\x08\v\f\x0E-\x1F\x7F]/);
    // Runs of whitespace collapse to single spaces.
    expect(msg).not.toMatch(/ {2,}/);
    expect(msg).toContain('bad request detail');
  });

  it('omits the separator when the body is empty', async () => {
    const msg = await errorFor(500, '');
    expect(msg).toBe('Gemini HTTP 500');
  });
});
