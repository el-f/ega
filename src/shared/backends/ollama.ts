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
import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS } from '../constants';
import { resolveModelId } from '@/shared/settings-schema';
import { iterNdjsonLines } from './sseParser';
import { classifyHttpError, httpErrorMessage } from './transportError';
import type { BackendId, ErrCode, TranslationChunk } from '../types';
import type { CancelToken } from '@/shared/cancel-token';
import { asBackendIdUnsafe } from '../brands';
import { backendLabel } from './provider-profiles';
import { withReasoningHeadroom } from './sampling-caps';
import { fetchOllamaModelCaps, ollamaBaseUrl, ollamaNumCtx, ollamaThink } from './ollama-show';

interface OllamaFrame {
  message?: { content?: string };
  done?: boolean;
  /** `'length'` when the answer stopped at `num_predict`. */
  done_reason?: string;
  error?: string;
  /** Final frame (done: true) carries token counts. */
  prompt_eval_count?: number;
  eval_count?: number;
}

/** A text-only model reports "model does not support images" in the error field — only the image call can hit that. */
function errorEvent(error: string, model: string, vision: boolean): StreamEvent {
  const needsVision = vision && /image|vision|multimodal/i.test(error);
  return {
    type: 'error',
    code: needsVision ? 'UNSUPPORTED' : 'UNKNOWN',
    message: needsVision
      ? `Model "${model}" doesn't support images. Pull a vision model: ollama pull gemma4 (or qwen2.5vl, llama3.2-vision).`
      : error,
  };
}

function* frameEvents(frame: OllamaFrame, model: string, vision: boolean): Generator<StreamEvent> {
  if (frame.error) {
    yield errorEvent(frame.error, model, vision);
    return;
  }
  const piece = frame.message?.content ?? '';
  if (piece) yield { type: 'text', text: piece };
  yield* usageEvents(frame.prompt_eval_count, frame.eval_count);
}

/** With shift off, a length stop at the context size means the context filled up, which a longer answer limit cannot fix. */
function stopEvent(frame: OllamaFrame, model: string, numCtx: number): StreamEvent {
  if (frame.done_reason !== 'length') return { type: 'stop', reason: 'end' };
  const used = (frame.prompt_eval_count ?? 0) + (frame.eval_count ?? 0);
  if (used < numCtx) return { type: 'stop', reason: 'max_tokens' };
  return {
    type: 'error',
    code: 'REQUEST',
    message: `The text, the earlier messages and the answer filled ${model}'s context (${numCtx} tokens). Select less text, start a new conversation in the side panel, or lower Effort.`,
  };
}

/** `/api/chat` streams NDJSON, not SSE: one JSON object per line, `done: true` last. Streaming is the text call, so no vision hint. */
async function* fromNdjson(
  bytes: AsyncIterable<Uint8Array>,
  model: string,
  numCtx: number,
): AsyncGenerator<StreamEvent> {
  for await (const line of iterNdjsonLines(bytes)) {
    let frame: OllamaFrame;
    try {
      frame = JSON.parse(line) as OllamaFrame;
    } catch {
      continue;
    }
    yield* frameEvents(frame, model, false);
    if (frame.done) yield stopEvent(frame, model, numCtx);
  }
}

function fromJson(json: unknown, model: string, vision: boolean, numCtx: number): StreamEvent[] {
  const frame = json as OllamaFrame;
  return [...frameEvents(frame, model, vision), stopEvent(frame, model, numCtx)];
}

function baseUrl(cfg: BackendConfig): string {
  return ollamaBaseUrl(cfg.ollamaUrl);
}

function showTimeoutMs(cfg: BackendConfig): number {
  return cfg.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS;
}

function egaOrigin(): string {
  const runtime = (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime;
  return runtime?.id ? `chrome-extension://${runtime.id}` : 'chrome-extension://<your-ega-id>';
}

/** A function, not a constant: `chrome.runtime.id` is not always bound at module-eval time. */
export function ollama403Message(): string {
  const origin = egaOrigin();
  return (
    `Ollama refused the request (HTTP 403). Allow Ega's exact origin: ` +
    `OLLAMA_ORIGINS="${origin}". Find a copy-ready value in Settings → Backends → Ollama. ` +
    `Avoid "*" or "chrome-extension://*" — they let any site or any installed extension reach ` +
    `your local Ollama. Local tools keep working: Ollama always allows ` +
    `127.0.0.1 and localhost, whatever OLLAMA_ORIGINS says.`
  );
}

/** A 403 is an `OLLAMA_ORIGINS` setting and a 404 is a missing pull — both name their own fix; the rest read like any provider. */
function httpError(res: Response, body: string, model: string): { code: ErrCode; message: string } {
  if (res.status === 403) return { code: 'AUTH', message: ollama403Message() };
  // With truncate: false Ollama answers 400 here instead of silently dropping the oldest turns.
  if (/exceed_context_size_error|exceeds the available context size/.test(body)) {
    const n = /n_ctx\\?"?:\s*(\d+)/.exec(body)?.[1];
    return {
      code: 'REQUEST',
      message: `The text and the earlier messages are longer than ${model}'s context${n ? ` (${n} tokens)` : ''}. Select less text, or start a new conversation in the side panel.`,
    };
  }
  return {
    code: classifyHttpError(res.status, body),
    message:
      res.status === 404
        ? `Ollama has no model called ${model}. Run: ollama pull ${model}`
        : httpErrorMessage('Ollama', res, body),
  };
}

export class OllamaBackend implements TranslationBackend {
  readonly id: BackendId = asBackendIdUnsafe('ollama');

  readonly manifest: BackendCapabilities = {
    id: this.id,
    name: backendLabel('ollama'),
    capabilities: { canVision: true },
  };

  async isAvailable(cfg: BackendConfig): Promise<boolean> {
    try {
      const timeoutMs = cfg.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS;
      const res = await fetch(`${baseUrl(cfg)}/api/tags`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** False only when /api/show says the model reads no images; an unknown answer keeps the model in the image chain. */
  async acceptsImages(cfg: BackendConfig): Promise<boolean> {
    const model = resolveModelId(cfg.model, 'ollama');
    const caps = await fetchOllamaModelCaps(baseUrl(cfg), model, showTimeoutMs(cfg));
    return caps?.vision !== false;
  }

  /** The one /api/chat round trip: text and image differ only in the messages they build. */
  private async run(
    requestId: string,
    cancel: CancelToken,
    config: BackendConfig,
    mode: 'text' | 'image',
    messages: unknown[],
    onChunk: (c: TranslationChunk) => void,
  ): Promise<void> {
    const model = resolveModelId(config.model, 'ollama');
    const stream = mode === 'text';
    const caps = await fetchOllamaModelCaps(baseUrl(config), model, showTimeoutMs(config));
    const { think, level } = ollamaThink(caps, config.advanced.effort ?? 'off');
    const numCtx = ollamaNumCtx(caps);
    const answer =
      think === false
        ? config.advanced.maxTokens
        : withReasoningHeadroom(config.advanced.maxTokens, level ? { level, wire: null } : null);
    return runStreamingChat({
      url: `${baseUrl(config)}/api/chat`,
      headers: { 'content-type': 'application/json' },
      payload: {
        model,
        messages,
        stream,
        // Ollama's 5m default evicts the model between selections when another app wants the GPU.
        keep_alive: '30m',
        // A missing `think` turns thinking on, and thinking spends num_predict before any answer.
        think,
        // A prompt that does not fit fails loudly instead of losing its oldest turns (truncate),
        truncate: false,
        // and an answer that fills the context stops instead of dropping earlier tokens (shift).
        shift: false,
        options: {
          temperature: config.advanced.temperature,
          // The answer cannot outgrow the context, thinking included.
          num_predict: Math.min(answer, numCtx),
          // One fixed size: a different num_ctx from the loaded runner reloads the model (~8 s here).
          num_ctx: numCtx,
        },
        // No `format`: on Ollama 0.34.4 a JSON schema costs about the same per token, and free decode already returns valid JSON.
      },
      stream,
      label: 'Ollama',
      requestId,
      signal: cancel.signal,
      onChunk,
      transportOpts: { allowCors: true, authMessage: ollama403Message() },
      httpError: (res, body) => httpError(res, body, model),
      fromBytes: (bytes) => fromNdjson(bytes, model, numCtx),
      fromJson: (json) => fromJson(json, model, mode === 'image', numCtx),
    });
  }

  translate(a: TranslateCallArgs): Promise<void> {
    return this.run(
      a.req.id,
      a.cancel,
      a.config,
      'text',
      [
        { role: 'system', content: a.system },
        ...(a.history ?? []).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: a.user },
      ],
      a.onChunk,
    );
  }

  translateImage(a: TranslateImageArgs): Promise<void> {
    return this.run(
      a.requestId,
      a.cancel,
      a.config,
      'image',
      [
        ...(a.system ? [{ role: 'system', content: a.system }] : []),
        {
          role: 'user',
          content:
            a.user ??
            'Read the text in this image and translate it into English. If there is no text, describe the image briefly. Reply with plain text only — no preamble.',
          // Bare base64 only — a data URL prefix breaks it, and the MIME type is inferred.
          images: [a.imageBase64],
        },
      ],
      a.onChunk,
    );
  }
}
