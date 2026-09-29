import {
  runStreamingChat,
  usageEvents,
  type StreamEvent,
  type TranslationBackend,
  type TranslateCallArgs,
  type TranslateImageArgs,
  type BackendConfig,
  type BackendCapabilities,
} from './base';
import { OCR_SYSTEM_PROMPT, OCR_USER_INSTRUCTION } from '../ocr-prompt';
import type { BackendId, TranslationChunk } from '../types';
import type { CancelToken } from '@/shared/cancel-token';
import { asBackendIdUnsafe } from '../brands';
import { getCloudProfile } from './provider-profiles';
import { iterSseDataPayloads } from './sseParser';
import { emitMissingKeyError } from './transportError';

const API = 'https://api.anthropic.com/v1/messages';
const LABEL = getCloudProfile('anthropic').label;
const ANTHROPIC_VERSION = '2023-06-01';

/** Both endpoints run the same browser-origin check, so both need the same three headers. */
function authHeaders(key: string): Record<string, string> {
  return {
    'x-api-key': key,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

// System goes as a one-block array, not a string, so `cache_control` can mark the prefix cacheable.
function cachedSystem(text: string): Array<{
  type: 'text';
  text: string;
  cache_control: { type: 'ephemeral' };
}> {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicSseFrame {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string | null };
  message?: { usage?: AnthropicUsage };
  usage?: AnthropicUsage;
  error?: { type?: string; message?: string };
}

function usageEvent(u: AnthropicUsage | undefined): StreamEvent[] {
  return usageEvents(u?.input_tokens, u?.output_tokens, u?.cache_read_input_tokens);
}

function stopEvent(reason: string | null | undefined): StreamEvent {
  if (reason === 'refusal') {
    return {
      type: 'error',
      // The next backend has the same kind of policy, so REQUEST stops the chain instead of walking it.
      code: 'REQUEST',
      message: 'The backend refused to answer this text. Reword it, or use another backend.',
    };
  }
  return { type: 'stop', reason: reason === 'max_tokens' ? 'max_tokens' : 'end' };
}

/** message_start carries input + cache-read, message_delta the running output and the stop reason, message_stop the end. */
async function* fromSse(bytes: AsyncIterable<Uint8Array>): AsyncGenerator<StreamEvent> {
  for await (const data of iterSseDataPayloads(bytes)) {
    let j: AnthropicSseFrame;
    try {
      j = JSON.parse(data) as AnthropicSseFrame;
    } catch {
      continue;
    }
    if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) {
      yield { type: 'text', text: j.delta.text };
    } else if (j.type === 'message_start') {
      yield* usageEvent(j.message?.usage);
    } else if (j.type === 'message_delta') {
      yield* usageEvent(j.usage);
      const reason = j.delta?.stop_reason;
      if (reason === 'max_tokens' || reason === 'refusal') yield stopEvent(reason);
    } else if (j.type === 'message_stop') {
      yield stopEvent('end');
    } else if (j.type === 'error') {
      yield {
        type: 'error',
        code: j.error?.type === 'rate_limit_error' ? 'RATE_LIMIT' : 'SERVER',
        message: j.error?.message ?? `${LABEL} reported a stream error.`,
      };
    }
  }
}

function fromJson(json: unknown): StreamEvent[] {
  const body = json as {
    content?: Array<{ text?: string }>;
    stop_reason?: string;
    usage?: AnthropicUsage;
  };
  return [
    { type: 'text', text: body.content?.map((c) => c.text ?? '').join('') ?? '' },
    ...usageEvent(body.usage),
    stopEvent(body.stop_reason),
  ];
}

export class AnthropicBackend implements TranslationBackend {
  readonly id: BackendId = asBackendIdUnsafe('anthropic');

  readonly manifest: BackendCapabilities = {
    id: this.id,
    name: LABEL,
    capabilities: { canVision: true },
  };

  isAvailable(cfg: BackendConfig): Promise<boolean> {
    return Promise.resolve(Boolean(cfg.apiKeys.anthropic));
  }

  /** The one messages round trip: text and image differ only in the content blocks they build. */
  private run(
    requestId: string,
    cancel: CancelToken,
    key: string,
    stream: boolean,
    payload: Record<string, unknown>,
    onChunk: (c: TranslationChunk) => void,
    rawAnswer?: boolean,
  ): Promise<void> {
    return runStreamingChat({
      url: API,
      headers: { 'content-type': 'application/json', ...authHeaders(key) },
      payload: { ...payload, stream },
      stream,
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
    const key = a.config.apiKeys.anthropic;
    if (!key) {
      emitMissingKeyError(a.onChunk, a.req.id, LABEL);
      return;
    }
    await this.run(
      a.req.id,
      a.cancel,
      key,
      a.stream,
      {
        model: a.config.model.anthropic,
        max_tokens: a.config.advanced.maxTokens,
        temperature: a.config.advanced.temperature,
        system: cachedSystem(a.system),
        messages: a.history?.length
          ? [
              ...a.history.map((h) => ({ role: h.role, content: h.content })),
              {
                role: 'user' as const,
                content: [
                  {
                    type: 'text' as const,
                    text: a.user,
                    cache_control: { type: 'ephemeral' as const },
                  },
                ],
              },
            ]
          : [{ role: 'user', content: a.user }],
      },
      a.onChunk,
      a.rawAnswer,
    );
  }

  async translateImage(a: TranslateImageArgs): Promise<void> {
    const key = a.config.apiKeys.anthropic;
    if (!key) {
      emitMissingKeyError(a.onChunk, a.requestId, LABEL);
      return;
    }
    await this.run(
      a.requestId,
      a.cancel,
      key,
      true,
      {
        model: a.config.model.anthropic,
        max_tokens: a.config.advanced.maxTokens,
        temperature: a.config.advanced.temperature,
        system: cachedSystem(a.system ?? OCR_SYSTEM_PROMPT),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: a.mediaType, data: a.imageBase64 },
              },
              { type: 'text', text: a.user ?? OCR_USER_INSTRUCTION },
            ],
          },
        ],
      },
      a.onChunk,
    );
  }

  async discoverModels(cfg: BackendConfig): Promise<string[]> {
    const key = cfg.apiKeys.anthropic;
    if (!key) return [];
    const ids: string[] = [];
    let afterId: string | undefined;
    // Paged at 1000 per call; the loop bound only guards a server that never says has_more: false.
    for (let page = 0; page < 10; page++) {
      const url = new URL('https://api.anthropic.com/v1/models');
      url.searchParams.set('limit', '1000');
      if (afterId !== undefined) url.searchParams.set('after_id', afterId);
      const res = await fetch(url, {
        method: 'GET',
        headers: authHeaders(key),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        throw new Error(`${LABEL} HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        data?: Array<{ id?: unknown }>;
        has_more?: unknown;
        last_id?: unknown;
      };
      if (!Array.isArray(body.data)) break;
      for (const m of body.data) {
        if (typeof m.id === 'string' && m.id.length > 0) ids.push(m.id);
      }
      if (body.has_more !== true || typeof body.last_id !== 'string') break;
      afterId = body.last_id;
    }
    return ids;
  }
}
