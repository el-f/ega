import { debugCatch } from '@/shared/logger';
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

export interface ParsedResult {
  translation: string;
  /** Absent when the response never carried one — never synthesized. */
  confidence?: number;
  detectedLang?: string;
  /** Free-form sub-variety label from the LLM. Paired with `detectedLang`
   *  which stays as a preset id. */
  detectedDetail?: string;
  /** Multi-variety detection. Populated only when source actually mixes
   *  varieties — renderers treat `.length > 1` as the pill-cluster signal. */
  detectedLangs?: DetectedVariety[];
  explain?: string;
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
): TranslationChunk {
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

// ReDoS-safe: avoids `\s*` adjacent to `[\s\S]*?` (would drive polynomial
// backtracking on malformed input). Caller trims the captured group.
const JSON_FENCE = /```(?:json)?([\s\S]*?)```/i;

/** 0..1 as asked, 10..100 read as a percent; anything else is dropped, since the pill would show it as the model's certainty. */
function toConfidence(n: unknown): number | undefined {
  const x = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
  if (x >= 0 && x <= 1) return x;
  if (x >= 10 && x <= 100) return x / 100;
  return undefined;
}

/** Drops details of 200+ chars (a hallucinated paragraph breaks the pill layout), same cap as detectedDetail. */
function parseDetectedLangs(raw: unknown): DetectedVariety[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: DetectedVariety[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.length > 0) {
      out.push({ id: entry });
      continue;
    }
    if (entry === null || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec['id'] === 'string' ? rec['id'] : undefined;
    if (id === undefined || id.length === 0) continue;
    const detailRaw = rec['detail'];
    const detail =
      typeof detailRaw === 'string' && detailRaw.length > 0 && detailRaw.length < 200
        ? detailRaw
        : undefined;
    out.push(detail !== undefined ? { id, detail } : { id });
  }
  return out.length > 0 ? out : undefined;
}

/** Models answer a multi-line request with an array of lines often enough that dropping
 *  it (and rendering a blank result) is worse than joining it. */
function coerceTranslation(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) return raw.join('\n');
  return undefined;
}

function isBlank(c: string | undefined): boolean {
  return c === ' ' || c === '\n' || c === '\t' || c === '\r';
}

function dropTrailingComma(out: string): string {
  let j = out.length - 1;
  while (j >= 0 && isBlank(out[j])) j--;
  return out[j] === ',' ? out.slice(0, j) + out.slice(j + 1) : out;
}

/** The first balanced object in `c`, with raw \n \r \t in strings escaped, a stray inner quote escaped and trailing commas dropped; null when the braces never balance. */
function repairEnvelope(c: string): string | null {
  const start = c.indexOf('{');
  if (start === -1) return null;
  let out = '';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < c.length; i++) {
    const ch = c[i] ?? '';
    if (inStr) {
      if (ch === '\\') {
        out += ch + (c[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (isBlank(c[j])) j++;
        const next = c[j];
        // A comma closes the string only when a key or the object's end follows it: 'said "yalla", then' is text.
        let k = j + 1;
        while (isBlank(c[k])) k++;
        const commaCloses =
          next === ',' && (c[k] === undefined || c[k] === '"' || c[k] === '}' || c[k] === ']');
        // A real closing quote is always followed by one of these; any other quote is text.
        if (next === undefined || commaCloses || next === '}' || next === ']' || next === ':') {
          inStr = false;
        } else {
          out += '\\"';
          continue;
        }
      }
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ch;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' || ch === ']') {
      out = dropTrailingComma(out);
      if (ch === '}' && --depth === 0) return out + ch;
    }
    out += ch;
  }
  return null;
}

/** Strict first, so valid JSON is never rewritten; one repaired retry after that. */
function parseLenient(c: string): unknown {
  try {
    return JSON.parse(c);
  } catch (strictErr) {
    const fixed = repairEnvelope(c);
    if (fixed === null) throw strictErr;
    return JSON.parse(fixed);
  }
}

function inOpenFence(body: string): boolean {
  const at = body.indexOf('```');
  return at !== -1 && body.slice(0, at).trim() === '' && !body.includes('```', at + 3);
}

/** A `{`-led body, or one inside an open ``` fence, is an envelope still arriving: show nothing yet. */
function envelopeArriving(body: string): boolean {
  const lead = firstNonBlank(body);
  return lead === '{' || (lead === '`' && inOpenFence(body));
}

/** Hot path: runs on every streaming delta. Manual `typeof` narrowing instead of a valibot parse, to avoid per-delta schema overhead. */
export function parseJsonResponse(body: string): ParsedResult {
  const candidates: string[] = [];
  // JSON_FENCE cannot match without a closing fence, so this guard stops it re-scanning the accumulator on every delta.
  const firstFence = body.indexOf('```');
  if (firstFence !== -1 && body.includes('```', firstFence + 3)) {
    const fenced = body.match(JSON_FENCE);
    if (fenced?.[1]) candidates.push(fenced[1].trim());
  }
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(body.slice(first, last + 1));
  // Prose with its own brace ("the {translation}:") hides the envelope from the span above.
  const keyed = body.search(/\{\s*"translation"\s*:/);
  if (keyed > first && last > keyed) candidates.push(body.slice(keyed, last + 1));

  for (const c of candidates) {
    try {
      const o = parseLenient(c) as Record<string, unknown>;
      const translation =
        coerceTranslation(o['translation']) ??
        (o['translation'] == null && typeof o['explain'] === 'string' ? '' : undefined);
      if (translation !== undefined) {
        const detectedLang = typeof o['detectedLang'] === 'string' ? o['detectedLang'] : undefined;
        const detectedDetail =
          typeof o['detectedDetail'] === 'string' && o['detectedDetail'].length < 200
            ? o['detectedDetail']
            : undefined;
        const detectedLangs = parseDetectedLangs(o['detectedLangs']);
        const explain = typeof o['explain'] === 'string' ? o['explain'] : undefined;
        const confidence = toConfidence(o['confidence']);
        return {
          translation,
          ...(confidence !== undefined ? { confidence } : {}),
          ...(detectedLang !== undefined ? { detectedLang } : {}),
          ...(detectedDetail !== undefined ? { detectedDetail } : {}),
          ...(detectedLangs !== undefined ? { detectedLangs } : {}),
          ...(explain !== undefined ? { explain } : {}),
        };
      }
    } catch (e) {
      debugCatch(e, 'shared.backends.base.1');
    }
  }
  // One-pass scan recovers {"translation":"hello wor — regex would backtrack on long accumulators.
  const partial = extractPartialTranslation(body);
  if (partial !== null) return { translation: partial };
  // An incomplete JSON envelope returns empty, or the UI flashes `{` and `{"t` before the partial-quote regex catches up.
  return { translation: envelopeArriving(body) ? '' : body.trim() };
}

/** The 'translation' value so far, or null before the key appears; an unclosed quote reads to end of input. */
function extractPartialTranslation(body: string): string | null {
  const keyIdx = body.indexOf('"translation"');
  if (keyIdx === -1) return null;
  let i = keyIdx + '"translation"'.length;
  while (i < body.length && (body[i] === ' ' || body[i] === '\t')) i++;
  if (body[i] !== ':') return null;
  i++;
  while (i < body.length && (body[i] === ' ' || body[i] === '\t')) i++;
  if (body[i] !== '"') return null;
  i++;
  let out = '';
  while (i < body.length) {
    const c = body[i];
    if (c === '\\') {
      const n = body[i + 1];
      if (n === 'u') {
        const hex = body.slice(i + 2, i + 6);
        // A truncated body can end inside the escape; four digits are all or nothing.
        if (hex.length < 4) break;
        if (HEX4.test(hex)) {
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          continue;
        }
      }
      if (n === '"') out += '"';
      else if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '\r';
      else if (n === '\\') out += '\\';
      else if (n !== undefined) out += n;
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  return out;
}

const TRANSLATION_KEY = '"translation"';
const HEX4 = /^[0-9a-f]{4}$/i;

type ScanPhase = 'key' | 'colon' | 'quote' | 'body' | 'done' | 'dead';

/** Incremental extractPartialTranslation: each feed reads only new bytes, so a stream costs one pass, not one per delta. */
function createTranslationScan(): {
  feed: (body: string) => string | null;
  closedAt: () => number;
} {
  let phase: ScanPhase = 'key';
  let cursor = 0;
  let out = '';
  let closeIdx = -1;

  function skipBlanks(body: string): void {
    while (cursor < body.length && (body[cursor] === ' ' || body[cursor] === '\t')) cursor++;
  }

  function feed(body: string): string | null {
    if (phase === 'dead') return null;
    if (phase === 'done') return out;
    if (phase === 'key') {
      const at = body.indexOf(TRANSLATION_KEY, cursor);
      if (at === -1) {
        // The key itself can straddle two deltas, so keep its last characters in play.
        cursor = Math.max(0, body.length - TRANSLATION_KEY.length + 1);
        return null;
      }
      cursor = at + TRANSLATION_KEY.length;
      phase = 'colon';
    }
    if (phase === 'colon') {
      skipBlanks(body);
      if (cursor >= body.length) return null;
      if (body[cursor] !== ':') {
        phase = 'dead';
        return null;
      }
      cursor++;
      phase = 'quote';
    }
    if (phase === 'quote') {
      skipBlanks(body);
      if (cursor >= body.length) return null;
      if (body[cursor] !== '"') {
        phase = 'dead';
        return null;
      }
      cursor++;
      phase = 'body';
    }
    while (cursor < body.length) {
      const c = body[cursor];
      if (c === '\\') {
        const n = body[cursor + 1];
        // A half-arrived escape resumes on the next feed.
        if (n === undefined) return out;
        if (n === 'u') {
          const hex = body.slice(cursor + 2, cursor + 6);
          if (hex.length < 4) return out;
          if (HEX4.test(hex)) {
            out += String.fromCharCode(Number.parseInt(hex, 16));
            cursor += 6;
            continue;
          }
        }
        out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
        cursor += 2;
        continue;
      }
      if (c === '"') {
        phase = 'done';
        closeIdx = cursor;
        return out;
      }
      out += c;
      cursor++;
    }
    return out;
  }

  return { feed, closedAt: () => closeIdx };
}

/** Last non-blank character. `trimEnd()` copies the whole accumulator on every delta. */
function lastNonBlank(s: string): string {
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') return c ?? '';
  }
  return '';
}

/** First non-blank character. */
function firstNonBlank(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') return c ?? '';
  }
  return '';
}

/** One memo per request: a module-level slot thrashes when two streams run at once. */
export function createMemoizedJsonParser(): (body: string) => ParsedResult {
  let lastBody = '';
  let lastResult: ParsedResult | null = null;
  let scan = createTranslationScan();

  return (body: string): ParsedResult => {
    if (lastResult !== null && body === lastBody) return lastResult;
    // A retry or a new turn replaces the accumulator instead of extending it.
    if (!body.startsWith(lastBody)) scan = createTranslationScan();
    lastBody = body;
    const partial = scan.feed(body);
    const tail = lastNonBlank(body);
    const closed = scan.closedAt();
    const complete = tail === '}' || tail === '`' || (closed >= 0 && body.includes('}', closed));
    // Only the full parse reads confidence / detectedLang / explain, so it waits for a closable envelope.
    lastResult = complete
      ? parseJsonResponse(body)
      : partial !== null
        ? { translation: partial }
        : { translation: envelopeArriving(body) ? '' : body.trim() };
    return lastResult;
  };
}

/** A closed envelope naming `translation` is an answer even when the value is empty — an
 *  image with no readable text answers exactly that. A body that never closed one is not. */
export function carriesAnswer(raw: string, parsed: ParsedResult): boolean {
  if (parsed.translation !== '' || parsed.explain !== undefined) return true;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last < first) return false;
  try {
    const o = parseLenient(raw.slice(first, last + 1)) as Record<string, unknown>;
    return coerceTranslation(o['translation']) !== undefined;
  } catch {
    return false;
  }
}

/** Visible text mid-stream: the parsed translation when present; otherwise empty for a `{`- or fence-led body (no raw flash), else the raw text. */
export function streamingTranslation(rawAcc: string, parsed: ParsedResult): string {
  if (parsed.translation) return parsed.translation;
  const lead = firstNonBlank(rawAcc);
  return lead === '{' || lead === '`' ? '' : rawAcc;
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
  const parsed = parseJsonResponse(visible);
  if (!visible.trim() || !carriesAnswer(visible, parsed)) {
    emitEmptyAnswerError(onChunk, requestId, label, opts.note);
    return;
  }
  onChunk(makeDoneChunk(requestId, parsed, opts.usage));
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
  const res = await fetch(a.url, {
    method: 'POST',
    signal: idle.signal,
    headers: a.headers,
    body: JSON.stringify(a.payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = a.httpError?.(res, body) ?? {
      code: classifyHttpError(res.status, body),
      message: httpErrorMessage(a.label, res, body),
    };
    yield { type: 'error', ...err, ...retryAfterFields(res) };
    return;
  }
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
    // PARSE never rotates, and a 2xx body the adapter cannot read is worth the next backend.
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
