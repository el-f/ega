import { describe, it, expect } from 'vitest';
import { GeminiBackend } from '@/shared/backends/gemini';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { buildBackendConfig } from '@/shared/backends/build-config';
import type { TranslateImageArgs } from '@/shared/backends/base';

// 2.5 Pro spends thinking out of maxOutputTokens before any text, so the image path needs the floor too.
describe('Gemini translateImage maxOutputTokens', () => {
  it('applies the same 4096 floor the text path applies', async () => {
    let body: Record<string, unknown> | null = null;
    setFetchHandler(async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        candidates: [{ content: { parts: [{ text: '{"translation":"hi"}' }] } }],
      });
    });
    const config = buildBackendConfig({
      ...DEFAULT_SETTINGS,
      geminiApiKey: 'k',
      advanced: { ...DEFAULT_SETTINGS.advanced, maxTokens: 100 },
    });
    const args: TranslateImageArgs = {
      imageBase64: 'AAAA',
      mediaType: 'image/png',
      requestId: 'r1',
      cancel: noopCancel(),
      config,
      onChunk: () => {},
      system: 'OCR-SYS',
      user: 'OCR-USER',
    };
    await new GeminiBackend().translateImage(args);
    const gen = (body as Record<string, unknown> | null)?.['generationConfig'] as
      { maxOutputTokens?: number } | undefined;
    expect(gen?.maxOutputTokens).toBe(4096);
  });
});
