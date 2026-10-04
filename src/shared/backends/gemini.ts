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
import { classifyHttpError, emitMissingKeyError, httpErrorMessage } from './transportError';
import { asBackendIdUnsafe } from '../brands';
import type { CancelToken } from '@/shared/cancel-token';
import { getCloudProfile } from './provider-profiles';
import {
  resolveEffort,
  resolveSamplingSupport,
  withReasoningHeadroom,
  type ResolvedEffort,
} from './sampling-caps';
import { resolveModelId, type TaskEffort } from '../settings-schema';
import type { ErrCode } from '../types';

interface GeminiBody {
  candidates?: Array<{
    // Nullable element: this frame is `as`-cast from untrusted JSON, so a part can be null.
    content?: { parts?: Array<{ text?: string } | null> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const NON_CHAT_MODEL_RE =
  /-(?:tts|live|transcribe|image|omni|embedding)\b|computer-use|native-audio|-streaming-/;
const LABEL = getCloudProfile('gemini').label;

/** Gemini ends a blocked answer with one of these instead of STOP. */
const REFUSAL_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'IMAGE_SAFETY',
  'ESCALATION',
]);

/** Reasons that cut the answer short even after some text, so the text is never shown as a finished answer. */
const BROKEN_REASONS: Readonly<Record<string, string>> = {
  LANGUAGE: `${LABEL} stopped because it does not support the language of this text.`,
  MALFORMED_RESPONSE: `${LABEL} sent a broken answer.`,
};

/** A finishReason or a prompt-level blockReason; STOP and anything unlisted end the stream normally. */
function finishEvent(reason: string, field: 'finishReason' | 'blockReason'): StreamEvent {
  if (reason === 'MAX_TOKENS') return { type: 'stop', reason: 'max_tokens' };
  if (reason === 'PUP_LIMITED_DISABLED') {
    return {
      type: 'error',
      code: 'AUTH',
      message: `Google limited or turned off this account's ${LABEL} access under its Prohibited Use Policy. Check the account in Google AI Studio, or use another backend.`,
    };
  }
  const broken = BROKEN_REASONS[reason];
  // SERVER rotates, so another backend gets the text.
  if (broken) return { type: 'error', code: 'SERVER', message: broken };
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
    ...(reason === 'STOP' ? {} : { note: `${field}: ${reason}` }),
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
  if (cand?.finishReason) yield finishEvent(cand.finishReason, 'finishReason');
  if (j.promptFeedback?.blockReason) yield finishEvent(j.promptFeedback.blockReason, 'blockReason');
  const um = j.usageMetadata;
  // Thinking tokens are billed as output but reported apart from the answer.
  const output =
    typeof um?.candidatesTokenCount === 'number'
      ? um.candidatesTokenCount + (um.thoughtsTokenCount ?? 0)
      : um?.thoughtsTokenCount;
  yield* usageEvents(um?.promptTokenCount, output, undefined, {
    reasoning: um?.thoughtsTokenCount,
  });
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

/** Thinking spends maxOutputTokens before any visible text, and 2.5 Pro and every 3.x model think at least a little. */
export function geminiMaxOutputTokens(
  maxTokens: number,
  effort: ResolvedEffort | null = null,
): number {
  return Math.max(withReasoningHeadroom(maxTokens, effort), 4096);
}

/** 2.x takes a budget (only 2.5 Flash can go to 0), 3.x takes a level, and a request with both is a 400. */
export function thinkingConfigFor(
  model: string,
  effort: TaskEffort = 'off',
): { thinkingConfig: { thinkingBudget: 0 } | { thinkingLevel: string } } | Record<string, never> {
  const id = model.trim().toLowerCase();
  if (/^gemini-2\.5-flash/.test(id)) return { thinkingConfig: { thinkingBudget: 0 } };
  // 1.x, 2.x and the -latest aliases take no level (an alias can point at 2.5, where a level is a 400).
  const level = resolveEffort('gemini', model, effort)?.wire;
  return level ? { thinkingConfig: { thinkingLevel: level } } : {};
}

/** Since 2026-09-18 Google serves 2.5 models only to keys that used them before; the status a new key gets is not documented. */
function httpError(res: Response, body: string, model: string): { code: ErrCode; message: string } {
  // Google answers a bad or expired key with 400 INVALID_ARGUMENT, which would otherwise stop the chain as REQUEST.
  if (res.status === 400 && /API_KEY_INVALID|API key (?:not valid|expired)/i.test(body)) {
    return {
      code: 'AUTH',
      message: `The backend rejected the API key. Check it in Settings → Backends.\n${httpErrorMessage(LABEL, res, body)}`,
    };
  }
  const closed = res.status === 404 && /no longer available to new users/i.test(body);
  // The status a new key gets on 2.5 is not documented, so any 400/403/404 qualifies, unless the body names another cause.
  const otherCause = /API[_ ]?KEY|leaked|SERVICE_DISABLED|location is not supported|billing/i.test(
    body,
  );
  if (
    closed ||
    (/^gemini-2\.5-/i.test(model.trim()) && [400, 403, 404].includes(res.status) && !otherCause)
  ) {
    return {
      code: closed ? 'REQUEST' : classifyHttpError(res.status, body),
      message: `Google gives Gemini 2.5 only to keys that used it before. Pick ${DEFAULT_MODEL.gemini} in Settings → Backends.\n${httpErrorMessage(LABEL, res, body)}`,
    };
  }
  return { code: classifyHttpError(res.status, body), message: httpErrorMessage(LABEL, res, body) };
}

// The ids Google names for new projects; the picker lists them first and keeps the API order after them.
const PINNED_MODELS: readonly string[] = [DEFAULT_MODEL.gemini, 'gemini-3.8-flash'];
const pinRank = (id: string): number => {
  const i = PINNED_MODELS.indexOf(id);
  return i < 0 ? PINNED_MODELS.length : i;
};

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
  ): Promise<void> {
    const model = resolveModelId(config.model, 'gemini');
    return runStreamingChat({
      url: `${BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      payload: {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          ...(resolveSamplingSupport('gemini', model).temperature
            ? { temperature: config.advanced.temperature }
            : {}),
          maxOutputTokens: geminiMaxOutputTokens(
            config.advanced.maxTokens,
            resolveEffort('gemini', model, config.advanced.effort ?? 'off'),
          ),
          responseMimeType: 'application/json',
          ...thinkingConfigFor(model, config.advanced.effort),
        },
      },
      stream: true,
      label: LABEL,
      requestId,
      signal: cancel.signal,
      onChunk,
      httpError: (res, body) => httpError(res, body, model),
      fromBytes: fromSse,
      fromJson,
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

  /** TTS, Live, image, transcribe and embedding ids are not chat models, so they are dropped by name. */
  async discoverModels(cfg: BackendConfig): Promise<string[]> {
    const key = cfg.apiKeys.gemini;
    if (!key) return [];
    // The default page holds 50 models; one page of 1000 holds the whole list.
    const res = await fetch(`${BASE_URL}?pageSize=1000`, {
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
      .filter((n) => n.startsWith('models/gemini-') && !NON_CHAT_MODEL_RE.test(n))
      .map((n) => n.replace(/^models\//, ''))
      .sort((a, b) => pinRank(a) - pinRank(b));
  }
}
