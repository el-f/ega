import { describe, it, expect } from 'vitest';
import { requireTranslateImage } from '@tests/_helpers/backend';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { GeminiBackend } from '@/shared/backends/gemini';
import { OllamaBackend } from '@/shared/backends/ollama';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import { buildOcrPrompt } from '@/shared/ocr-prompt';
import type { TranslateImageArgs } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

const baseConfig = {
  apiKeys: { anthropic: 'sk-ant-test', openai: 'sk-test', gemini: 'g-key' },
  model: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o',
    gemini: 'gemini-1.5-flash',
    groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-chat',
    together: '',
    mistral: '',
    xai: '',
    fireworks: '',
    openrouter: '',
    ollama: 'llava',
    localserver: '',
    native: '',
  },
  advanced: {
    promptTemplate: { system: 's', user: 'u' },
    perPresetTemplates: {},
    temperature: 0.2,
    maxTokens: 1024,
  },
};

const IMG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const frPrompt = buildOcrPrompt('French');

function mkImgArgs(over: Partial<TranslateImageArgs> = {}): TranslateImageArgs {
  return {
    requestId: 'img-t3',
    imageBase64: IMG_BASE64,
    mediaType: 'image/png',
    cancel: noopCancel(),
    config: baseConfig,
    onChunk: () => {},
    system: frPrompt.system,
    user: frPrompt.user,
    ...over,
  };
}

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`;
}

function openAiSseChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

function geminiSseChunk(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] })}\n\n`;
}

describe('vision backends honor the configured target language', () => {
  it('AnthropicBackend.translateImage uses a.system and a.user when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(sseChunk('{"translation":"bonjour","confidence":0.9}')));
          c.enqueue(enc.encode('data: {"type":"message_stop"}\n\n'));
          c.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const chunks: TranslationChunk[] = [];
    await new AnthropicBackend().translateImage(mkImgArgs({ onChunk: (c) => chunks.push(c) }));
    expect(capturedBody['system']).toEqual([
      { type: 'text', text: frPrompt.system, cache_control: { type: 'ephemeral' } },
    ]);
    const messages = capturedBody['messages'] as Array<{ content: unknown[] }>;
    const firstContent = messages[0]?.content ?? [];
    const textPart = firstContent.find(
      (p): p is { type: string; text: string } =>
        typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text',
    );
    expect(textPart?.text).toBe(frPrompt.user);
    expect(chunks.find((c) => c.type === 'done')).toBeDefined();
  });

  it('AnthropicBackend.translateImage falls back to English OCR when system/user absent', async () => {
    let capturedBody: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(sseChunk('{"translation":"hello","confidence":0.8}')));
          c.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const { system: _s, user: _u, ...noPrompt } = mkImgArgs();
    await new AnthropicBackend().translateImage(noPrompt);
    const sysBlocks = capturedBody['system'] as Array<{ text: string }>;
    expect(sysBlocks[0]?.text.toLowerCase()).toContain('english');
  });

  it('openai translateImage uses a.system and a.user when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(openAiSseChunk('{"translation":"bonjour","confidence":0.9}')));
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    await requireTranslateImage(makeOpenAICompatBackend('openai'))(mkImgArgs());
    const messages = capturedBody['messages'] as Array<{ role: string; content: unknown }>;
    const sysMsg = messages.find((m) => m.role === 'system');
    expect(sysMsg?.content).toBe(frPrompt.system);
    const userMsg = messages.find((m) => m.role === 'user');
    const userContent = userMsg?.content as Array<{ type: string; text?: string }>;
    const textPart = userContent.find((p) => p.type === 'text');
    expect(textPart?.text).toBe(frPrompt.user);
  });

  it('GeminiBackend.translateImage uses a.system and a.user when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(geminiSseChunk('{"translation":"bonjour","confidence":0.9}')));
          c.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    await new GeminiBackend().translateImage(mkImgArgs());
    const si = capturedBody['systemInstruction'] as { parts: Array<{ text: string }> };
    expect(si.parts[0]?.text).toBe(frPrompt.system);
    const contents = capturedBody['contents'] as Array<{
      role: string;
      parts: Array<{ text?: string }>;
    }>;
    const userParts = contents.find((c) => c.role === 'user')?.parts;
    const textPart = userParts?.find((p) => p.text !== undefined);
    expect(textPart?.text).toBe(frPrompt.user);
  });

  it('OllamaBackend.translateImage uses a.user when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: { content: 'bonjour' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    await new OllamaBackend().translateImage(mkImgArgs());
    const messages = capturedBody['messages'] as Array<{ role: string; content: string }>;
    const sysMsg = messages.find((m) => m.role === 'system');
    const userMsg = messages.find((m) => m.role === 'user');
    expect(sysMsg?.content).toBe(frPrompt.system);
    expect(userMsg?.content).toBe(frPrompt.user);
  });

  it('OllamaBackend.translateImage omits system message when a.system is absent', async () => {
    let capturedBody: Record<string, unknown> = {};
    setFetchHandler(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: { content: 'hello' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const { system: _s2, user: _u2, ...noPrompt2 } = mkImgArgs();
    await new OllamaBackend().translateImage(noPrompt2);
    const messages = capturedBody['messages'] as Array<{ role: string }>;
    expect(messages.every((m) => m.role !== 'system')).toBe(true);
  });
});
