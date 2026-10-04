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
import { fetchOpenAICompatibleModels } from './discoverShared';
import { iterSseDataPayloads } from './sseParser';
import { emitMissingKeyError } from './transportError';
import { OCR_SYSTEM_PROMPT, OCR_USER_INSTRUCTION } from '../ocr-prompt';
import type { BackendId, TranslationChunk } from '../types';
import { asBackendIdUnsafe } from '../brands';
import { getProfile, profileApiKey, type OpenAICompatProfile } from './provider-profiles';
import { resolveEffort, resolveSamplingSupport, withReasoningHeadroom } from './sampling-caps';
import { fetchOpenRouterReasoning, openRouterPlan } from './openrouter-reasoning';
import { resolveModelId } from '../settings-schema';
import type { CancelToken } from '@/shared/cancel-token';

interface OpenAIBody {
  choices?: Array<{
    delta?: { content?: unknown; refusal?: string | null };
    message?: { content?: unknown; refusal?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { type?: string; code?: string; message?: string };
}

function usageEvent(u: OpenAIBody['usage']): StreamEvent[] {
  return usageEvents(u?.prompt_tokens, u?.completion_tokens, undefined, {
    reasoning: u?.completion_tokens_details?.reasoning_tokens,
  });
}

// DeepSeek and Mistral end a cut answer with these; reading them as a clean stop shows half an answer as done.
const EARLY_STOP_REASONS: ReadonlySet<string> = new Set([
  'error',
  'insufficient_system_resource',
  'aborted',
]);

function stopEvent(finish: string | null | undefined, label: string): StreamEvent {
  if (finish && EARLY_STOP_REASONS.has(finish)) {
    return {
      type: 'error',
      code: 'SERVER',
      message: `${label} stopped the answer early (${finish}). Try again.`,
    };
  }
  return { type: 'stop', reason: finish === 'length' ? 'max_tokens' : 'end' };
}

/** Mistral reasoning models send content as a list of thinking and text parts; only the text is the answer. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const part of content as unknown[]) {
    const p = part as { type?: unknown; text?: unknown } | null;
    if (p?.type === 'text' && typeof p.text === 'string') text += p.text;
  }
  return text;
}

// The next backend has the same kind of policy, so REQUEST stops the chain instead of walking it.
function refusalEvent(text: string): StreamEvent {
  const said = text.trim();
  return {
    type: 'error',
    code: 'REQUEST',
    message:
      said.length > 0
        ? said
        : 'The backend refused to answer this text. Reword it, or use another backend.',
  };
}

// The final `include_usage` frame carries `usage` with an empty `choices` array, so the delta read skips it.
export async function* fromSse(
  bytes: AsyncIterable<Uint8Array>,
  label: string,
): AsyncGenerator<StreamEvent> {
  let refusal = '';
  for await (const data of iterSseDataPayloads(bytes)) {
    if (data === '[DONE]') {
      yield refusal ? refusalEvent(refusal) : stopEvent(null, label);
      continue;
    }
    let j: OpenAIBody;
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.error) {
      // Only a rate limit is worth waiting on; everything else the provider reports is SERVER.
      yield {
        type: 'error',
        code: /rate.?limit/i.test(`${j.error.type ?? ''} ${j.error.code ?? ''}`)
          ? 'RATE_LIMIT'
          : 'SERVER',
        message: j.error.message ?? `${label} reported a stream error.`,
      };
      continue;
    }
    const choice = j.choices?.[0];
    const piece = textOf(choice?.delta?.content);
    if (piece) yield { type: 'text', text: piece };
    if (choice?.delta?.refusal) refusal += choice.delta.refusal;
    const finish = choice?.finish_reason;
    if (finish === 'content_filter' || (finish && refusal)) {
      yield refusalEvent(refusal);
      return;
    }
    if (finish) {
      const stop = stopEvent(finish, label);
      yield stop;
      if (stop.type === 'error') return;
    }
    yield* usageEvent(j.usage);
  }
}

export function fromJson(json: unknown, label: string): StreamEvent[] {
  const body = json as OpenAIBody;
  const choice = body.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') {
    return [refusalEvent(choice.message?.refusal ?? '')];
  }
  return [
    { type: 'text', text: textOf(choice?.message?.content) },
    ...usageEvent(body.usage),
    stopEvent(choice?.finish_reason, label),
  ];
}

// A cold read of OpenRouter's model list on the request path; past it the request goes out as before.
const OPENROUTER_LIST_TIMEOUT_MS = 2000;

export class OpenAICompatBackend implements TranslationBackend {
  readonly id: BackendId;
  readonly manifest: BackendCapabilities;
  protected readonly profile: OpenAICompatProfile;

  /** Assigned only when `profile.canVision` — conformance asserts `canVision === (typeof translateImage === 'function')`. */
  translateImage?: (args: TranslateImageArgs) => Promise<void>;

  constructor(profile: OpenAICompatProfile) {
    this.profile = profile;
    this.id = asBackendIdUnsafe(profile.id);
    this.manifest = {
      id: this.id,
      name: profile.label,
      capabilities: { canVision: profile.canVision },
    };
    if (profile.canVision) {
      this.translateImage = (args) => this.runImage(args);
    }
  }

  isAvailable(cfg: BackendConfig): Promise<boolean> {
    return Promise.resolve(Boolean(profileApiKey(this.profile, cfg)));
  }

  /** Which knobs a model takes comes from resolveSamplingSupport; how a provider names and bounds them comes from its profile. */
  private async samplingFields(
    cfg: BackendConfig,
    model: string,
  ): Promise<Record<string, unknown>> {
    const asked = cfg.advanced.effort ?? 'off';
    const live =
      this.id === 'openrouter'
        ? await fetchOpenRouterReasoning(model, OPENROUTER_LIST_TIMEOUT_MS)
        : undefined;
    // OpenRouter's own record of the model decides its fields; the name tables are the fallback.
    const plan = live === undefined ? null : openRouterPlan(live, asked);
    const effort = plan ? null : resolveEffort(this.id, model, asked);
    const room = plan ? (plan.room ? { level: plan.room, wire: null } : null) : effort;
    const support = resolveSamplingSupport(this.id, model);
    const p = this.profile;
    return {
      ...(support.temperature
        ? { temperature: Math.min(cfg.advanced.temperature, p.maxTemperature ?? 2) }
        : {}),
      ...(support.maxTokens
        ? {
            [p.maxTokensField ?? 'max_tokens']: withReasoningHeadroom(cfg.advanced.maxTokens, room),
          }
        : {}),
      ...(plan ? plan.fields : effort?.wire ? { reasoning_effort: effort.wire } : {}),
    };
  }

  /** The one chat-completions round trip: text and image differ only in the messages they build. */
  private run(
    requestId: string,
    cancel: CancelToken,
    key: string,
    stream: boolean,
    payload: Record<string, unknown>,
    onChunk: (c: TranslationChunk) => void,
  ): Promise<void> {
    return runStreamingChat({
      url: this.profile.baseUrl,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      payload: {
        ...this.profile.extraBody,
        ...payload,
        stream,
        // Streaming omits usage unless asked; the trailing empty-choices frame then carries it.
        ...(stream && this.profile.streamUsage !== false
          ? { stream_options: { include_usage: true } }
          : {}),
      },
      stream,
      label: this.profile.label,
      requestId,
      signal: cancel.signal,
      onChunk,
      fromBytes: (bytes) => fromSse(bytes, this.profile.label),
      fromJson: (json) => fromJson(json, this.profile.label),
    });
  }

  async translate(a: TranslateCallArgs): Promise<void> {
    const key = profileApiKey(this.profile, a.config);
    if (!key) {
      emitMissingKeyError(a.onChunk, a.req.id, this.profile.label);
      return;
    }
    const model = resolveModelId(a.config.model, this.profile.id);
    await this.run(
      a.req.id,
      a.cancel,
      key,
      a.stream,
      {
        model,
        ...(await this.samplingFields(a.config, model)),
        messages: [
          { role: 'system', content: a.system },
          ...(a.history ?? []).map((h) => ({ role: h.role, content: h.content })),
          { role: 'user', content: a.user },
        ],
      },
      a.onChunk,
    );
  }

  protected async runImage(a: TranslateImageArgs): Promise<void> {
    const key = profileApiKey(this.profile, a.config);
    if (!key) {
      emitMissingKeyError(a.onChunk, a.requestId, this.profile.label);
      return;
    }
    const model = resolveModelId(a.config.model, this.profile.id);
    await this.run(
      a.requestId,
      a.cancel,
      key,
      true,
      {
        model,
        ...(await this.samplingFields(a.config, model)),
        // The OCR prompt asks for JSON only; constrained output keeps deltas parseable.
        response_format: { type: 'json_object' },
        messages: [
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
      },
      a.onChunk,
    );
  }

  async discoverModels(cfg: BackendConfig): Promise<string[]> {
    const key = profileApiKey(this.profile, cfg);
    if (!key) return [];
    return fetchOpenAICompatibleModels(this.profile.modelsUrl, key, this.profile.discoverFilter);
  }
}

/** Throws on an unknown id so a registry typo fails at module load. */
export function makeOpenAICompatBackend(profileId: string): OpenAICompatBackend {
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`[ega.backends] unknown provider profile: ${profileId}`);
  return new OpenAICompatBackend(profile);
}
