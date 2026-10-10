import type { ErrCode, TranslationChunk } from '../types';
import { debugCatch } from '../logger';

export type TransportErrorCode = 'ABORTED' | 'TIMEOUT' | 'NETWORK' | 'AUTH';

export interface ClassifyOpts {
  /** Report a CORS rejection as `AUTH`. Ollama rejects the `chrome-extension://` origin until `OLLAMA_ORIGINS` is set. */
  allowCors?: boolean;
}

/** Order matters: an abort wins over a timeout and the CORS opt-in, and everything left falls through to `NETWORK`. */
export function classifyTransportError(e: unknown, opts: ClassifyOpts = {}): TransportErrorCode {
  const msg = e instanceof Error ? e.message : String(e);
  if ((e instanceof DOMException && e.name === 'AbortError') || /abort/i.test(msg)) {
    return 'ABORTED';
  }
  if ((e instanceof DOMException && e.name === 'TimeoutError') || /timed out|timeout/i.test(msg)) {
    return 'TIMEOUT';
  }
  if (opts.allowCors && /forbidden|origin|cors/i.test(msg)) {
    return 'AUTH';
  }
  return 'NETWORK';
}

export function classifyHttpStatus(status: number): ErrCode {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 402) return 'QUOTA';
  if (status === 429 || status === 529) return 'RATE_LIMIT';
  // 408 is the one retryable 4xx.
  if (status === 408) return 'NETWORK';
  // Every other 4xx repeats for the same payload, so retry and rotation only re-fail.
  if (status >= 400 && status < 500) return 'REQUEST';
  // 5xx is the provider failing, not the network: same retry and rotate policy, its own label.
  return 'SERVER';
}

/** The provider's error: `error` of the JSON body, or the body itself for Mistral's top-level `{object:"error", message}`. Undefined when the body is not JSON. */
function providerError(body: string): unknown {
  try {
    const json = JSON.parse(body) as { error?: unknown; object?: unknown } | null;
    return json?.object === 'error' ? json : json?.error;
  } catch {
    return undefined;
  }
}

// OpenAI's spend and credit limits; a retry cannot pass any of them.
const OUT_OF_CREDIT_CODES: ReadonlySet<string> = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
]);

// Not /billing/i: OpenAI's ordinary rate-limit text links to the billing page.
function isOutOfCredit(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const { code, type, message } = err as { code?: unknown; type?: unknown; message?: unknown };
  return (
    (typeof code === 'string' && OUT_OF_CREDIT_CODES.has(code)) ||
    type === 'insufficient_quota' ||
    (typeof message === 'string' && /credit balance is too low/i.test(message))
  );
}

/** Out of credit arrives as a 400 (Anthropic) or a 429 (OpenAI), so the status alone reads it as a bad request or a rate limit. */
export function classifyHttpError(status: number, body: string): ErrCode {
  if ((status === 400 || status === 429) && isOutOfCredit(providerError(body))) return 'QUOTA';
  return classifyHttpStatus(status);
}

/** Max chars of an upstream sentence surfaced to the user. */
const ERROR_BODY_TAIL = 200;

/** A gateway HTML page or a wrong-content-type body must not fill the toast. */
function sanitizeErrorBody(body: string): string {
  const cleaned = body
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > ERROR_BODY_TAIL ? cleaned.slice(0, ERROR_BODY_TAIL) : cleaned;
}

/** Providers answer with `{error:{message}}` (Gemini, OpenAI), `{error:"…"}` (Ollama) or Mistral's top-level `message`. Anything else is not worth showing. */
function providerErrorDetail(body: string): string {
  const err = providerError(body);
  if (typeof err === 'string') return sanitizeErrorBody(err);
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' ? sanitizeErrorBody(message) : '';
}

/** Anthropic, OpenAI-compatible, Gemini, llama-server (both of its texts) and LM Studio (old and new). */
const OVER_CONTEXT =
  /prompt is too long|maximum context length|input token count .* exceeds|exceeds the available context size|larger than the max context size|context size has been exceeded|context length of only/i;

/** The prompt is over the model's context. LM Studio sends the sentence as a bare string. */
function isPromptTooLong(err: unknown): boolean {
  if (typeof err === 'string') return OVER_CONTEXT.test(err);
  if (err === null || typeof err !== 'object') return false;
  const { code, type, message } = err as { code?: unknown; type?: unknown; message?: unknown };
  return (
    code === 'context_length_exceeded' ||
    type === 'exceed_context_size_error' ||
    (typeof message === 'string' && OVER_CONTEXT.test(message))
  );
}

/** OpenAI's model_not_found; Mistral's type invalid_model (mistral-vibe #617; its docs show code unknown_model). */
function isUnknownModel(err: unknown): boolean {
  const { code, type } = (err ?? {}) as { code?: unknown; type?: unknown };
  return code === 'model_not_found' || code === 'unknown_model' || type === 'invalid_model';
}

/** The one next step for an error the user can act on. Empty when there is none. */
function httpStatusAdvice(status: number, code: ErrCode, body: string): string {
  if (code === 'QUOTA')
    return 'The backend says the account is out of credit or over its spend limit. Add credit or raise the limit with the provider, or use another backend.';
  // A retired or unknown model is named in the body, and the status is not always 404; the body beats a 403.
  if (status === 404 || isUnknownModel(providerError(body))) {
    return 'The backend does not know this model id. Pick another one in Settings → Backends.';
  }
  if (status === 401 || status === 403) {
    return 'The backend rejected the API key. Check it in Settings → Backends.';
  }
  // Not 422: DeepSeek and Mistral use it for a bad parameter, so "too long" would send the user the wrong way.
  if (status === 413 || (status === 400 && isPromptTooLong(providerError(body)))) {
    return 'The request was too long. Select less text.';
  }
  return '';
}

/** One sentence with the next step, then a separate line with the provider's words and status that a renderer may fold. */
export function httpErrorMessage(label: string, res: Response, body = ''): string {
  const advice = httpStatusAdvice(res.status, classifyHttpError(res.status, body), body);
  const detail = providerErrorDetail(body);
  return (
    (advice ? `${advice}\n` : '') + `${label} HTTP ${res.status}` + (detail ? `: ${detail}` : '')
  );
}

/** A stream that closed without its terminal frame delivered only part of the answer. */
export function emitStreamTruncatedError(
  onChunk: (c: TranslationChunk) => void,
  requestId: string,
): void {
  onChunk({
    type: 'error',
    requestId,
    code: 'PROTOCOL',
    message: 'The connection dropped before the answer finished.',
  });
}

/**
 * The model stopped at its output ceiling. REQUEST, so the chain stops: the next backend
 * runs under the same cap and would cut the answer at the same place. Never a `done` —
 * the router caches a done, and a cached half-answer is served forever.
 */
export function emitMaxTokensError(
  onChunk: (c: TranslationChunk) => void,
  requestId: string,
  answered: boolean,
): void {
  onChunk({
    type: 'error',
    requestId,
    code: 'REQUEST',
    // Thinking models spend the same budget on reasoning, so an empty cut is not a long answer.
    message: answered
      ? 'The answer hit the max-tokens limit and stopped early. Raise Longest answer in Settings → Answers.'
      : 'The model hit the max-tokens limit before it wrote any answer; reasoning counts toward the limit. Raise Longest answer in Settings → Answers, or lower Effort there or for this task in Settings → Tasks.',
  });
}

/** A stream that ended cleanly but carried no text at all — worth another backend. */
export function emitEmptyAnswerError(
  onChunk: (c: TranslationChunk) => void,
  requestId: string,
  label: string,
  note?: string,
): void {
  onChunk({
    type: 'error',
    requestId,
    code: 'EMPTY',
    message: `${label} returned an empty answer.${note !== undefined ? ` (${note})` : ''}`,
  });
}

/** A line protocol that never completed one event inside the buffer ceiling. */
export function emitUnreadableStreamError(
  onChunk: (c: TranslationChunk) => void,
  requestId: string,
): void {
  onChunk({
    type: 'error',
    requestId,
    code: 'PROTOCOL',
    message: 'The backend sent a reply Ega could not read. Try again, or pick another model.',
  });
}

export function emitMissingKeyError(
  onChunk: (c: TranslationChunk) => void,
  requestId: string,
  provider: string,
): void {
  onChunk({
    type: 'error',
    requestId,
    code: 'AUTH',
    message: `No ${provider} API key`,
  });
}

/** The raw throw ("Failed to fetch", "NetworkError when attempting…") says nothing a user can act on. */
const TRANSPORT_MESSAGE: Record<TransportErrorCode, string> = {
  ABORTED: 'cancelled',
  // No Settings clause: the one live source is the fixed STREAM_IDLE_TIMEOUT_MS watchdog, and error-policy.ts optionsTabForMessage turns "Settings → X" into a CTA.
  TIMEOUT: 'The backend took too long to answer. Try again.',
  NETWORK: 'Could not reach the backend. Check your internet connection.',
  AUTH: 'The backend refused the connection. Check the API key, or the allowed origins of a local server.',
};

export interface EmitTransportOpts extends ClassifyOpts {
  /** Replaces the generic AUTH sentence. Ollama uses it to name the `OLLAMA_ORIGINS` fix. */
  authMessage?: string;
  /** Replaces the generic NETWORK sentence, which blames the internet connection, for a server on this machine. */
  networkMessage?: string;
}

export function emitTransportError(
  onChunk: (c: TranslationChunk) => void,
  requestId: string,
  error: unknown,
  opts?: EmitTransportOpts,
): void {
  const code = classifyTransportError(error, opts);
  if (code !== 'ABORTED') debugCatch(error, 'shared.backends.transportError');
  onChunk({
    type: 'error',
    requestId,
    code,
    message:
      code === 'AUTH' && opts?.authMessage
        ? opts.authMessage
        : code === 'NETWORK' && opts?.networkMessage
          ? opts.networkMessage
          : TRANSPORT_MESSAGE[code],
  });
}
