import {
  runStreamingChat,
  usageEvents,
  type StreamEvent,
  type BackendCapabilities,
  type BackendConfig,
  type TranslateCallArgs,
  type TranslateImageArgs,
  type TranslationBackend,
} from './base';
import type { TranslationChunk, BackendId } from '../types';
import { OCR_SYSTEM_PROMPT, OCR_USER_INSTRUCTION } from '../ocr-prompt';
import { DEFAULT_MODEL } from '@/shared/settings-defaults';
import { iterSseDataPayloads } from './sseParser';
import { emitMissingKeyError } from './transportError';
import { asBackendIdUnsafe } from '../brands';
import type { CancelToken } from '@/shared/cancel-token';
import { getCloudProfile } from './provider-profiles';

interface GeminiBody {
  candidates?: Array<{
    // Nullable element: this frame is `as`-cast from untrusted JSON, so a part can be null.
    content?: { parts?: Array<{ text?: string } | null> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const LABEL = getCloudProfile('gemini').label;

/** Gemini ends a blocked answer with one of these instead of STOP. */
const REFUSAL_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
]);

/** A finishReason or a prompt-level blockReason; STOP and anything unlisted end the stream normally. */
function finishEvent(reason: string): StreamEvent {
  if (reason === 'MAX_TOKENS') return { type: 'stop', reason: 'max_tokens' };
  if (REFUSAL_REASONS.has(reason)) {
    return {
      type: 'error',
      // The next backend has the same policy, so REQUEST stops the chain instead of walking it.
      code: 'REQUEST',
      message: 'The backend refused to answer this text. Reword it, or use another backend.',
    };
  }
  // STOP is the ordinary end; anything else still ends the stream, but names itself if nothing answered.
  return {
    type: 'stop',
    reason: 'end',
    ...(reason === 'STOP' ? {} : { note: `finishReason: ${reason}` }),
  };
}

/** Gemini can send multi-part frames — reading only parts[0] drops the trailing text. */
function* bodyEvents(j: GeminiBody): Generator<StreamEvent> {
  const cand = j.candidates?.[0];
  let combined = '';
  // `p.text` on a null part throws and kills the whole stream generator.
  for (const p of cand?.content?.parts ?? []) {
    if (p && typeof p.text === 'string') combined += p.text;
  }
  if (combined) yield { type: 'text', text: combined };
  if (cand?.finishReason) yield finishEvent(cand.finishReason);
  if (j.promptFeedback?.blockReason) yield finishEvent(j.promptFeedback.blockReason);
  const um = j.usageMetadata;
  yield* usageEvents(um?.promptTokenCount, um?.candidatesTokenCount);
}

async function* fromSse(bytes: AsyncIterable<Uint8Array>): AsyncGenerator<StreamEvent> {
  for await (const data of iterSseDataPayloads(bytes)) {
    let j: GeminiBody;
    try {
      j = JSON.parse(data) as GeminiBody;
    } catch {
      continue;
    }
    yield* bodyEvents(j);
  }
}

/** Non-SSE shape — the API has swapped shapes before. A fully-parsed body cannot be a truncated stream. */
function fromJson(json: unknown): StreamEvent[] {
  return [...bodyEvents(json as GeminiBody), { type: 'stop', reason: 'end' }];
}

/** 2.5 Pro cannot turn thinking off and spends it out of maxOutputTokens before any visible text; Flash gets budget 0 and loses nothing. */
export function geminiMaxOutputTokens(maxTokens: number): number {
  return Math.max(maxTokens, 4096);
}

/** Only the 2.5 Flash family accepts a zero budget; 2.5 Pro needs at least 128 and older models 400 on the field. */
export function thinkingConfigFor(
  model: string,
): { thinkingConfig: { thinkingBudget: 0 } } | Record<string, never> {
  return /gemini-2\.5-flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {};
}

export class GeminiBackend implements TranslationBackend {
  readonly id: BackendId = asBackendIdUnsafe('gemini');

  readonly manifest: BackendCapabilities = {
    id: this.id,
    name: LABEL,
    capabilities: { canVision: true },
  };

  isAvailable(cfg: BackendConfig): Promise<boolean> {
    return Promise.resolve(Boolean(cfg.apiKeys.gemini));
  }

  /** The one streamGenerateContent round trip: text and image differ only in the contents they build. */
  private run(
    requestId: string,
    cancel: CancelToken,
    key: string,
    config: BackendConfig,
    system: string,
    contents: unknown[],
    onChunk: (c: TranslationChunk) => void,
    rawAnswer?: boolean,
  ): Promise<void> {
    const model = config.model.gemini || DEFAULT_MODEL.gemini;
    return runStreamingChat({
      url: `${BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      payload: {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: config.advanced.temperature,
          maxOutputTokens: geminiMaxOutputTokens(config.advanced.maxTokens),
          responseMimeType: 'application/json',
          ...thinkingConfigFor(model),
        },
      },
      stream: true,
      label: LABEL,
      requestId,
      signal: cancel.signal,
      onChunk,
      fromBytes: fromSse,
      fromJson,
      ...(rawAnswer === true ? { rawAnswer: true } : {}),
    });
  }

  async translate(a: TranslateCallArgs): Promise<void> {
    const key = a.config.apiKeys.gemini;
    if (!key) {
      emitMissingKeyError(a.onChunk, a.req.id, LABEL);
      return;
    }
    await this.run(
      a.req.id,
      a.cancel,
      key,
      a.config,
      a.system,
      [
        ...(a.history ?? []).map((h) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        })),
        { role: 'user', parts: [{ text: a.user }] },
      ],
      a.onChunk,
      a.rawAnswer,
    );
  }

  async translateImage(a: TranslateImageArgs): Promise<void> {
    const key = a.config.apiKeys.gemini;
    if (!key) {
      emitMissingKeyError(a.onChunk, a.requestId, LABEL);
      return;
    }
    await this.run(
      a.requestId,
      a.cancel,
      key,
      a.config,
      a.system ?? OCR_SYSTEM_PROMPT,
      [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: a.mediaType, data: a.imageBase64 } },
            { text: a.user ?? OCR_USER_INSTRUCTION },
          ],
        },
      ],
      a.onChunk,
    );
  }

  /** Embeddings, TTS and image-gen ids also come back here and 404 on generateContent. */
  async discoverModels(cfg: BackendConfig): Promise<string[]> {
    const key = cfg.apiKeys.gemini;
    if (!key) return [];
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      throw new Error(`${LABEL} HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }>;
    };
    if (!Array.isArray(body.models)) return [];
    return body.models
      .filter((m) => {
        const methods = m.supportedGenerationMethods;
        return Array.isArray(methods) && methods.includes('generateContent');
      })
      .map((m) => (typeof m.name === 'string' ? m.name : ''))
      .filter((n) => n.startsWith('models/gemini-'))
      .map((n) => n.replace(/^models\//, ''));
  }
}
