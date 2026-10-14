import type { ParsedResult } from '../answer/legacy-reader';
export {
  parseJsonResponse,
  carriesAnswer,
  createMemoizedJsonParser,
  streamingTranslation,
} from '../answer/legacy-reader';
export type { ParsedResult } from '../answer/legacy-reader';
import type {
  ErrCode,
  BackendId,
  DetectedVariety,
  TokenUsage,
  TranslationChunk,
  TranslationRequest,
} from '../types';
import type { ChatTurn } from '@/shared/chat-history';
import type { ModelMap } from '../settings-schema';
import type { NativeCliId } from '../native-cli-registry';
import type { CancelToken } from '@/shared/cancel-token';
import {
  classifyHttpError,
  emitEmptyAnswerError,
  emitMaxTokensError,
  emitStreamTruncatedError,
  emitTransportError,
  type EmitTransportOpts,
  emitUnreadableStreamError,
  httpErrorMessage,
} from './transportError';
import {
  STREAM_IDLE_TIMEOUT_MS,
  idleAbort,
  retryAfterFields,
  streamBytes,
  withIdleTimeout,
} from './stream-resilience';
import { SseBufferOverflowError } from './sseParser';
import { createThinkScrubber } from './think-scrubber';
import {
  rejectSchema,
  schemaRejection,
  type AnswerFormatRequest,
  type SchemaFallback,
} from './structured-output';

/** Only canVision is read at runtime (image routing). */
export interface CapabilityFlags {
  readonly canVision: boolean;
}

/** Registry key (id), chip label (name) and image-chain gate (capabilities.canVision). */
export interface BackendCapabilities {
  readonly id: BackendId;
  readonly name: string;
  readonly capabilities: CapabilityFlags;
}

import type { CloudProviderId } from '../provider-ids';

export interface BackendConfig {
  apiKeys: Partial<Record<CloudProviderId, string>>;
  model: ModelMap;
  /** Defaults to http://localhost:11434 when absent. */
  ollamaUrl?: string;
  /** Defaults to http://127.0.0.1:1234 (LM Studio) when absent. */
  localServerUrl?: string;
  /** Validated against NATIVE_CLI_REGISTRY; sent as the backend field of every native-host message. */
  nativeCli?: NativeCliId;
  /** Unified timeout (ms) for local-backend probes + short ops (native-host
   *  ping, Ollama preflight). Absent → backend uses its shipped default. */
  localBackendTimeoutMs?: number;
  advanced: {
    temperature: number;
    maxTokens: number;
    /** ega's neutral level; sampling-caps.ts#resolveEffort maps it per backend and model. Absent → 'off'. */
    effort?: 'off' | 'low' | 'medium' | 'high';
  };
}

export interface TranslateCallArgs {
  answerFormat?: AnswerFormatRequest;
  req: TranslationRequest;
  system: string;
  user: string;
  stream: boolean;
  /** Prior turns, spliced before the final user message. Absent on single-turn requests. */
  history?: ChatTurn[];
  /** Backends read cancel.signal; the reason stays opaque to them but lets the router turn ABORTED into TIMEOUT. */
  cancel: CancelToken;
  onChunk: (c: TranslationChunk) => void;
  config: BackendConfig;
}

export interface TranslateImageArgs {
  answerFormat?: AnswerFormatRequest;
  imageBase64: string;
  mediaType: string;
  requestId: string;
  cancel: CancelToken;
  config: BackendConfig;
  onChunk: (c: TranslationChunk) => void;
  /** Pre-built OCR system prompt for the target language. When absent,
   *  backends fall back to their default (English) OCR prompt. */
  system?: string;
  /** Pre-built OCR user instruction for the target language. When absent,
   *  backends fall back to their default (English) OCR instruction. */
  user?: string;
}

export interface TranslationBackend {
  id: BackendId;
  /** capabilities.canVision is the only image-routing gate; the conformance suite checks it matches translateImage. */
  readonly manifest: BackendCapabilities;
  isAvailable(config: BackendConfig): Promise<boolean>;
  translate(args: TranslateCallArgs): Promise<void>;
  /** Vision-capable backends implement this. Native CLI opts out and
   *  consumers fall through to UNSUPPORTED. */
  translateImage?: (args: TranslateImageArgs) => Promise<void>;
  /** Empty array when no key is set; throws on HTTP, transport or parse errors so the UI can show them (the native host returns [] instead). */
  discoverModels?: (config: BackendConfig) => Promise<string[]>;
  /** False keeps the backend out of the image chain for the model the config names (a text-only local model). */
  acceptsImages?: (config: BackendConfig) => Promise<boolean>;
}

/** Drop an all-absent usage block so the `done` chunk omits `usage`
 *  entirely (exactOptionalPropertyTypes) rather than carrying `{}`. */
function nonEmptyUsage(usage: TokenUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  const out: TokenUsage = {
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.cacheReadTokens !== undefined ? { cacheReadTokens: usage.cacheReadTokens } : {}),
    ...(usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
    ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

/** One usage block from a provider's own count fields; an all-absent block never reaches `runStream`. */
export function usageEvents(
  input: number | undefined,
  output: number | undefined,
  cacheRead?: number,
  more: { cacheWrite?: number | undefined; reasoning?: number | undefined } = {},
): StreamEvent[] {
  const usage: TokenUsage = {
    ...(typeof input === 'number' ? { inputTokens: input } : {}),
    ...(typeof output === 'number' ? { outputTokens: output } : {}),
    ...(typeof cacheRead === 'number' ? { cacheReadTokens: cacheRead } : {}),
    ...(typeof more.cacheWrite === 'number' ? { cacheWriteTokens: more.cacheWrite } : {}),
    ...(typeof more.reasoning === 'number' ? { reasoningTokens: more.reasoning } : {}),
  };
  return Object.keys(usage).length > 0 ? [{ type: 'usage', usage }] : [];
}

/** Omits absent optional fields instead of setting undefined (exactOptionalPropertyTypes). */
export function makeDoneChunk(
  requestId: string,
  parsed: ParsedResult,
  usage?: TokenUsage,
): Extract<TranslationChunk, { type: 'done' }> {
  const u = nonEmptyUsage(usage);
  return {
    type: 'done',
    requestId,
    ...(parsed.confidence !== undefined ? { confidence: parsed.confidence } : {}),
    ...(parsed.detectedLang !== undefined ? { detectedLang: parsed.detectedLang } : {}),
    ...(parsed.detectedDetail !== undefined ? { detectedDetail: parsed.detectedDetail } : {}),
    ...(parsed.detectedLangs !== undefined ? { detectedLangs: parsed.detectedLangs } : {}),
    ...(parsed.explain !== undefined ? { explain: parsed.explain } : {}),
    ...(u !== undefined ? { usage: u } : {}),
  };
}

/** Both the done chunk and the parsed body can carry detected fields; the chunk wins. */
export interface DetectedSource {
  detectedLang?: string;
  detectedDetail?: string;
  detectedLangs?: DetectedVariety[];
  explain?: string;
}

/** What every provider translator yields; `runStream` is the one consumer. */
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: TokenUsage }
  /** `max_tokens`: the provider cut the answer at its output cap. `note` names the provider's own stop reason. */
  | { type: 'stop'; reason: 'end' | 'max_tokens'; note?: string }
  | { type: 'error'; code: ErrCode; message: string; retryAfterMs?: number };

export interface RunStreamArgs {
  requestId: string;
  /** Human label for error text ("Anthropic returned an empty answer."). */
  label: string;
  onChunk: (c: TranslationChunk) => void;
  /** A stream that ends without its stop frame after this fired is ABORTED, not truncated. */
  signal?: AbortSignal;
  transportOpts?: EmitTransportOpts;
  /** The backend passes model special tokens through raw, so Gemma 4's thought channel is hidden too. */
  gemmaChannels?: boolean;
}

/** The terminal for a stream that stopped cleanly: the empty-answer error when nothing answered, else done. */
export function emitTerminal(
  onChunk: (c: TranslationChunk) => void,
  requestId: string,
  label: string,
  raw: string,
  opts: { usage?: TokenUsage; note?: string; gemmaChannels?: boolean } = {},
): void {
  const scrub = createThinkScrubber({ gemmaChannels: opts.gemmaChannels === true });
  const visible = scrub.push(raw) + scrub.flush();
  if (!visible.trim()) {
    emitEmptyAnswerError(onChunk, requestId, label, opts.note);
    return;
  }
  const usage = nonEmptyUsage(opts.usage);
  onChunk({ type: 'done', requestId, ...(usage ? { usage } : {}) });
}

/**
 * The one stream consumer: deltas out as they arrive, usage merged, the stop latch, the
 * max-tokens and empty-answer mapping, and exactly one terminal chunk on every path —
 * including a translator that throws.
 */
export async function runStream(
  events: AsyncIterable<StreamEvent> | Iterable<StreamEvent>,
  a: RunStreamArgs,
): Promise<void> {
  let raw = '';
  let stop: 'end' | 'max_tokens' | undefined;
  let stopNote: string | undefined;
  const usage: TokenUsage = {};
  try {
    for await (const evt of events) {
      if (evt.type === 'text') {
        raw += evt.text;
        a.onChunk({ type: 'delta', requestId: a.requestId, text: evt.text });
      } else if (evt.type === 'usage') {
        Object.assign(usage, evt.usage);
      } else if (evt.type === 'stop') {
        // Text can still follow a stop frame, so keep reading; a max-tokens cut is never undone by a later stop.
        if (stop !== 'max_tokens') stop = evt.reason;
        // A later note-less stop frame must not erase the reason the provider named.
        if (evt.note !== undefined) stopNote = evt.note;
      } else {
        const { type: _type, ...err } = evt;
        a.onChunk({ type: 'error', requestId: a.requestId, ...err });
        return;
      }
    }
    if (stop === undefined) {
      // A user cancel also ends the stream without its stop frame — that is ABORTED, not truncation.
      if (a.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      emitStreamTruncatedError(a.onChunk, a.requestId);
      return;
    }
    if (stop === 'max_tokens') {
      const scrub = createThinkScrubber({ gemmaChannels: a.gemmaChannels === true });
      emitMaxTokensError(a.onChunk, a.requestId, (scrub.push(raw) + scrub.flush()).trim() !== '');
      return;
    }
    emitTerminal(a.onChunk, a.requestId, a.label, raw, {
      usage,
      ...(a.gemmaChannels ? { gemmaChannels: true } : {}),
      ...(stopNote !== undefined ? { note: stopNote } : {}),
    });
  } catch (e) {
    if (e instanceof SseBufferOverflowError) {
      emitUnreadableStreamError(a.onChunk, a.requestId);
      return;
    }
    emitTransportError(a.onChunk, a.requestId, e, a.transportOpts);
  }
}

export interface RunStreamingChatArgs extends RunStreamArgs {
  schemaFallback?: SchemaFallback;
  url: string;
  headers: Record<string, string>;
  /** Fully built request body, including the provider's own `stream` flag. */
  payload: Record<string, unknown>;
  stream: boolean;
  /** The provider's stream frames → events. */
  fromBytes: (bytes: AsyncIterable<Uint8Array>) => AsyncIterable<StreamEvent>;
  /** The provider's non-stream JSON body → events. */
  fromJson: (json: unknown) => Iterable<StreamEvent>;
  /** Replaces the default `!res.ok` chunk for providers whose statuses name their own fix. */
  httpError?: (res: Response, body: string) => { code: ErrCode; message: string };
}

async function* httpEvents(a: RunStreamingChatArgs): AsyncGenerator<StreamEvent> {
  const idle = idleAbort(a.signal);
  const post = (payload: Record<string, unknown>) =>
    fetch(a.url, {
      method: 'POST',
      signal: idle.signal,
      headers: a.headers,
      body: JSON.stringify(payload),
    });
  let res = await post(a.payload);
  let usedSchema = a.schemaFallback !== undefined;
  let failedBody: string | undefined;
  if (a.schemaFallback && !res.ok) {
    failedBody = await res.text().catch(() => '');
    if (schemaRejection(res.status, failedBody)) {
      rejectSchema(a.schemaFallback.backend, a.schemaFallback.model);
      usedSchema = false;
      res = await post(a.schemaFallback.payload);
      failedBody = undefined;
    }
  }
  if (!res.ok) {
    const body = failedBody ?? (await res.text().catch(() => ''));
    const err = a.httpError?.(res, body) ?? {
      code: classifyHttpError(res.status, body),
      message: httpErrorMessage(a.label, res, body),
    };
    yield { type: 'error', ...err, ...retryAfterFields(res) };
    return;
  }
  if (usedSchema) a.schemaFallback?.onAccepted?.();
  if (a.stream && res.body) {
    try {
      yield* a.fromBytes(
        withIdleTimeout(streamBytes(res.body), STREAM_IDLE_TIMEOUT_MS, idle.abort),
      );
    } finally {
      // `body.cancel()` rejects while the reader holds the lock; aborting is what frees the socket.
      idle.abort();
    }
    return;
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // This is unreadable transport JSON; task answer validation happens in the worker.
    yield { type: 'error', code: 'SERVER', message: `${a.label} returned an unreadable response.` };
    return;
  }
  yield* a.fromJson(json);
}

/** Shared HTTP chat round trip for the cloud adapters and Ollama: fetch, !res.ok error, idle timeout, then runStream. */
export function runStreamingChat(a: RunStreamingChatArgs): Promise<void> {
  return runStream(httpEvents(a), a);
}

/** Single place for chunk-over-parsed precedence of the four detected fields, used on every done. */
export function extractDetectedFields(
  parsed: DetectedSource,
  chunk: DetectedSource,
): {
  detectedLang?: string;
  detectedDetail?: string;
  detectedLangs?: DetectedVariety[];
  explain?: string;
} {
  const detectedLang = chunk.detectedLang ?? parsed.detectedLang;
  const detectedDetail = chunk.detectedDetail ?? parsed.detectedDetail;
  const detectedLangs = chunk.detectedLangs ?? parsed.detectedLangs;
  const explain = chunk.explain ?? parsed.explain;
  return {
    ...(detectedLang !== undefined ? { detectedLang } : {}),
    ...(detectedDetail !== undefined ? { detectedDetail } : {}),
    ...(detectedLangs !== undefined ? { detectedLangs } : {}),
    ...(explain !== undefined ? { explain } : {}),
  };
}
