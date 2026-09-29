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
import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS, DEFAULT_OLLAMA_URL } from '../constants';
import { DEFAULT_MODEL } from '@/shared/settings-defaults';
import { isLoopbackOllamaUrl } from '../ollama-url';
import { iterNdjsonLines } from './sseParser';
import { classifyHttpError, httpErrorMessage } from './transportError';
import type { BackendId, ErrCode, TranslationChunk } from '../types';
import type { CancelToken } from '@/shared/cancel-token';
import { asBackendIdUnsafe } from '../brands';

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
      ? `Model "${model}" doesn't support images. Pull a vision model: ollama pull llava (or llama3.2-vision, bakllava, qwen2-vl).`
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

function stopEvent(frame: OllamaFrame): StreamEvent {
  return { type: 'stop', reason: frame.done_reason === 'length' ? 'max_tokens' : 'end' };
}

/** `/api/chat` streams NDJSON, not SSE: one JSON object per line, `done: true` last. Streaming is the text call, so no vision hint. */
async function* fromNdjson(
  bytes: AsyncIterable<Uint8Array>,
  model: string,
): AsyncGenerator<StreamEvent> {
  for await (const line of iterNdjsonLines(bytes)) {
    let frame: OllamaFrame;
    try {
      frame = JSON.parse(line) as OllamaFrame;
    } catch {
      continue;
    }
    yield* frameEvents(frame, model, false);
    if (frame.done) yield stopEvent(frame);
  }
}

function fromJson(json: unknown, model: string, vision: boolean): StreamEvent[] {
  const frame = json as OllamaFrame;
  return [...frameEvents(frame, model, vision), stopEvent(frame)];
}

function baseUrl(cfg: BackendConfig): string {
  const raw = (cfg.ollamaUrl ?? DEFAULT_OLLAMA_URL).trim();
  // Re-check at the sink so a write path that skips the schema cannot probe other local services.
  const url = isLoopbackOllamaUrl(raw) ? raw : DEFAULT_OLLAMA_URL;
  return url.replace(/\/+$/, '');
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
    name: 'Ollama',
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

  /** The one /api/chat round trip: text and image differ only in the messages they build. */
  private run(
    requestId: string,
    cancel: CancelToken,
    config: BackendConfig,
    mode: 'text' | 'image',
    messages: unknown[],
    onChunk: (c: TranslationChunk) => void,
    rawAnswer?: boolean,
  ): Promise<void> {
    const model = config.model.ollama || DEFAULT_MODEL.ollama;
    const stream = mode === 'text';
    return runStreamingChat({
      url: `${baseUrl(config)}/api/chat`,
      headers: { 'content-type': 'application/json' },
      payload: {
        model,
        messages,
        stream,
        // Ollama's 5m default evicts the model between selections when another app wants the GPU.
        keep_alive: '30m',
        options: {
          temperature: config.advanced.temperature,
          num_predict: config.advanced.maxTokens,
        },
        // No `format: 'json'`: the grammar-constrained sampler is 3-10× slower than free decode.
      },
      stream,
      label: 'Ollama',
      requestId,
      signal: cancel.signal,
      onChunk,
      transportOpts: { allowCors: true, authMessage: ollama403Message() },
      httpError: (res, body) => httpError(res, body, model),
      fromBytes: (bytes) => fromNdjson(bytes, model),
      fromJson: (json) => fromJson(json, model, mode === 'image'),
      ...(rawAnswer === true ? { rawAnswer: true } : {}),
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
      a.rawAnswer,
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
