import {
  runStreamingChat,
  type BackendCapabilities,
  type BackendConfig,
  type TranslateCallArgs,
  type TranslateImageArgs,
  type TranslationBackend,
} from './base';
import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS, DEFAULT_LOCAL_SERVER_URL } from '../constants';
import { isLoopbackUrl } from '../loopback-url';
import { debugCatch } from '../logger';
import { lookupModelId } from '../settings-schema';
import { structuredChatPayload, type AnswerFormatRequest } from './structured-output';
import { isPlainObject } from '../settings-clamp';
import { OCR_SYSTEM_PROMPT, OCR_USER_INSTRUCTION } from '../ocr-prompt';
import { asBackendIdUnsafe } from '../brands';
import type { BackendId, ErrCode, TranslationChunk } from '../types';
import type { CancelToken } from '@/shared/cancel-token';
import { fetchOpenAICompatibleModels } from './discoverShared';
import { fromJson, fromSse } from './openai-compat';
import { backendLabel } from './provider-profiles';
import { classifyHttpError, httpErrorMessage } from './transportError';

/** Loopback only, checked again here so a write path that skips the schema cannot reach another machine. */
export function localServerBaseUrl(raw: string | undefined): string {
  const url = (raw ?? '').trim();
  const safe = url && isLoopbackUrl(url) ? url : DEFAULT_LOCAL_SERVER_URL;
  // OpenAI SDK base URLs end in /v1, so a pasted one would otherwise ask for /v1/v1/models.
  return safe.replace(/\/+$/, '').replace(/\/v1$/i, '');
}

// LM Studio lists its bundled embedding model next to the chat models, and it cannot answer a chat.
const isChatModel = (id: string): boolean => !/embed/i.test(id);

function probeTimeoutMs(cfg: BackendConfig): number {
  return cfg.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS;
}

/** The label every error names, so the user sees which address failed. */
function where(base: string): string {
  return `Local server at ${base}`;
}

/** The first loaded chat model, from LM Studio's REST API (/api/v1, then the older /api/v0); '' on any other server. */
async function loadedLmStudioModel(base: string, timeoutMs: number): Promise<string> {
  for (const path of ['/api/v1/models', '/api/v0/models']) {
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      const j = (await res.json()) as { models?: unknown; data?: unknown };
      const rows = Array.isArray(j.models) ? j.models : Array.isArray(j.data) ? j.data : [];
      for (const r of rows as unknown[]) {
        if (!isPlainObject(r) || /embed/i.test(String(r['type'] ?? ''))) continue;
        const loaded =
          (Array.isArray(r['loaded_instances']) && r['loaded_instances'].length > 0) ||
          r['state'] === 'loaded';
        const id = typeof r['key'] === 'string' ? r['key'] : r['id'];
        if (loaded && typeof id === 'string' && id !== '') return id;
      }
    } catch (e) {
      debugCatch(e, 'shared.backends.local-server.loadedLmStudioModel');
    }
  }
  return '';
}

/** An empty slot runs the first chat model the server lists; with no list the request goes without one and the server picks. */
async function modelFor(cfg: BackendConfig, base: string): Promise<string> {
  const slot = lookupModelId(cfg.model, 'localserver').trim();
  if (slot) return slot;
  // LM Studio's /v1/models lists every downloaded model; its own API says which one is loaded.
  const loaded = await loadedLmStudioModel(base, probeTimeoutMs(cfg));
  if (loaded) return loaded;
  try {
    const ids = await fetchOpenAICompatibleModels(
      `${base}/v1/models`,
      '',
      isChatModel,
      probeTimeoutMs(cfg),
    );
    return ids[0] ?? '';
  } catch (e) {
    // The chat request that follows reports the real failure.
    debugCatch(e, 'shared.backends.local-server.modelFor');
    return '';
  }
}

function httpError(
  res: Response,
  body: string,
  base: string,
  model: string,
  image: boolean,
): { code: ErrCode; message: string } {
  // llama-server answers 501 for an image on a text-only model; LM Studio says so in the body.
  if (image && (res.status === 501 || /image|vision|multimodal|mmproj/i.test(body))) {
    return {
      code: 'UNSUPPORTED',
      message: `The model${model ? ` "${model}"` : ''} at ${base} cannot read images. Load a vision model in the server, or pick one in Settings → Backends.`,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      code: 'AUTH',
      message: `The local server at ${base} asks for an API key (HTTP ${res.status}). Ega sends none, so start the server without one.`,
    };
  }
  if (res.status === 404) {
    return {
      code: 'REQUEST',
      message: `The server at ${base} has no OpenAI-compatible /v1/chat/completions, or no model${model ? ` "${model}"` : ''}. Check the URL and the model in Settings → Backends.`,
    };
  }
  return {
    code: classifyHttpError(res.status, body),
    message: httpErrorMessage(where(base), res, body),
  };
}

/** LM Studio, llama.cpp's llama-server, or any server on this machine that speaks the OpenAI chat API. Keyless. */
export class LocalServerBackend implements TranslationBackend {
  readonly id: BackendId = asBackendIdUnsafe('localserver');

  readonly manifest: BackendCapabilities = {
    id: this.id,
    name: backendLabel('localserver'),
    // A text-only model answers the image call with an error the user sees.
    capabilities: { canVision: true },
  };

  async isAvailable(cfg: BackendConfig): Promise<boolean> {
    try {
      const res = await fetch(`${localServerBaseUrl(cfg.localServerUrl)}/v1/models`, {
        signal: AbortSignal.timeout(probeTimeoutMs(cfg)),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  discoverModels(cfg: BackendConfig): Promise<string[]> {
    return fetchOpenAICompatibleModels(
      `${localServerBaseUrl(cfg.localServerUrl)}/v1/models`,
      '',
      isChatModel,
    );
  }

  /** The one chat-completions round trip: text and image differ only in the messages they build. */
  private async run(
    requestId: string,
    cancel: CancelToken,
    cfg: BackendConfig,
    stream: boolean,
    image: boolean,
    messages: unknown[],
    onChunk: (c: TranslationChunk) => void,
    answerFormat?: AnswerFormatRequest,
  ): Promise<void> {
    const base = localServerBaseUrl(cfg.localServerUrl);
    const model = await modelFor(cfg, base);
    const label = where(base);
    return runStreamingChat({
      url: `${base}/v1/chat/completions`,
      headers: { 'content-type': 'application/json' },
      ...structuredChatPayload('localserver', model, answerFormat, {
        ...(model ? { model } : {}),
        messages,
        stream,
        temperature: cfg.advanced.temperature,
        max_tokens: cfg.advanced.maxTokens,
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
      stream,
      label,
      requestId,
      signal: cancel.signal,
      onChunk,
      gemmaChannels: true,
      transportOpts: {
        networkMessage: `Cannot reach the local server at ${base}. Start the server (LM Studio, or llama-server), then try again.`,
      },
      httpError: (res, body) => httpError(res, body, base, model, image),
      fromBytes: (bytes) => fromSse(bytes, label),
      fromJson: (json) => fromJson(json, label),
    });
  }

  translate(a: TranslateCallArgs): Promise<void> {
    return this.run(
      a.req.id,
      a.cancel,
      a.config,
      a.stream,
      false,
      [
        { role: 'system', content: a.system },
        ...(a.history ?? []).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: a.user },
      ],
      a.onChunk,
      a.answerFormat,
    );
  }

  translateImage(a: TranslateImageArgs): Promise<void> {
    return this.run(
      a.requestId,
      a.cancel,
      a.config,
      true,
      true,
      [
        { role: 'system', content: a.system ?? OCR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: a.user ?? OCR_USER_INSTRUCTION },
            {
              type: 'image_url',
              image_url: { url: `data:${a.mediaType};base64,${a.imageBase64}` },
            },
          ],
        },
      ],
      a.onChunk,
      a.answerFormat,
    );
  }
}
