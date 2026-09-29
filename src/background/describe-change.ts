import type { Settings, TranslationRequest } from '@/shared/types';
import { asLangIdUnsafe } from '@/shared/brands';
import type { BackendConfig, TranslationBackend } from '@/shared/backends/base';
import { createCancelToken, type CancelToken } from '@/shared/cancel-token';
import {
  buildMetaPrompt,
  parseDescribeChangeResponse,
  type DescribeChangeContext,
} from '@/shared/template-rewrite';
import { resolveBackend, getRegisteredBackendIds } from '@/shared/backends/registry';
import { computeBackendOrder } from '@/shared/backends/select';
import { DESCRIBE_CHANGE_OUTER_TIMEOUT_MS, MAX_DESCRIBE_INPUT_CHARS } from '@/shared/constants';
import { debugCatch } from '@/shared/logger';
import { pushAuditEntry } from '@/shared/audit-log';
import { lookupModelId } from '@/shared/settings-schema';
import { trackInflight } from './swKeepalive';
import type { DescribeChangeReply } from '@/shared/messages';

export type DescribeChangeResult = DescribeChangeReply;

async function tryDescribeOnce(
  backend: TranslationBackend,
  cfg: BackendConfig,
  system: string,
  user: string,
  input: string,
  cancel: CancelToken,
): Promise<DescribeChangeResult> {
  if (!(await backend.isAvailable(cfg))) {
    return { ok: false, reason: 'unavailable' };
  }

  let accumulated = '';
  let done = false;
  let errorMsg = '';
  let errorCode = '';

  const req: TranslationRequest = {
    id: `describe-change-${crypto.randomUUID()}`,
    text: input,
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    options: { stream: false, explain: false },
  };
  const startedAt = Date.now();

  // Race against cancel.signal, because a backend that ignores its AbortSignal would otherwise strand sendResponse.
  const abortRace = new Promise<void>((resolve) => {
    if (cancel.signal.aborted) {
      resolve();
      return;
    }
    cancel.signal.addEventListener('abort', () => resolve(), { once: true });
  });
  await Promise.race([
    backend.translate({
      req,
      system,
      user,
      stream: false,
      // The reply is a rule, not a translation, so any text it wrote is the answer.
      rawAnswer: true,
      cancel,
      config: cfg,
      onChunk: (c) => {
        if (c.type === 'delta') accumulated += c.text;
        else if (c.type === 'done') done = true;
        else {
          errorCode = c.code;
          errorMsg = `${c.code}: ${c.message}`;
        }
      },
    }),
    abortRace,
  ]);

  void pushAuditEntry({
    task: 'describe-change',
    sourceLang: 'auto',
    targetLang: 'en',
    backend: backend.id,
    model: lookupModelId(cfg.model, backend.id),
    systemPrompt: system,
    userPrompt: user,
    response: errorMsg ? '' : accumulated,
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
    requestId: req.id,
    ...(errorMsg ? { error: { code: errorCode, message: errorMsg } } : {}),
  }).catch(() => {});

  if (errorMsg) return { ok: false, reason: `BACKEND_ERR: ${errorMsg}` };
  // `done` is written inside the onChunk closure, which literal narrowing cannot see.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!done) return { ok: false, reason: 'no done chunk' };

  const parsed = parseDescribeChangeResponse(accumulated);
  if (parsed) return { ok: true, response: parsed };
  return { ok: false, reason: 'parse failed' };
}

/** Turns a freeform refinement into a Rule; the first backend returning parseable JSON wins. */
export async function describeChange(
  input: string,
  ctx: DescribeChangeContext,
  opts: { settings: Settings; config: BackendConfig; timeoutMs: number },
): Promise<DescribeChangeResult> {
  const registeredIds = getRegisteredBackendIds();
  const chain = computeBackendOrder(opts.settings, registeredIds);
  if (chain.length === 0) {
    return { ok: false, reason: 'no backend available' };
  }

  const boundedInput =
    input.length > MAX_DESCRIBE_INPUT_CHARS ? input.slice(0, MAX_DESCRIBE_INPUT_CHARS) : input;
  const { system, user } = buildMetaPrompt(boundedInput, ctx);
  const cfg: BackendConfig = opts.config;

  // Bounds the whole chain walk; per-attempt timeouts alone would add up to minutes.
  const outerSignal = AbortSignal.timeout(DESCRIBE_CHANGE_OUTER_TIMEOUT_MS);
  let lastReason = 'all backends unavailable';
  const isAborted = (): boolean => outerSignal.aborted;
  // Counts answers, not positions: an unconfigured backend must not hide the configured one behind it.
  const maxAnswers = 1 + opts.settings.advanced.retryCount;
  let answers = 0;
  // A 30-60s non-streaming call outlives Chrome's ~30s idle eviction without a keepalive tap.
  const release = trackInflight();
  try {
    for (const id of chain) {
      if (isAborted()) {
        lastReason = 'outer budget exhausted';
        break;
      }
      const backend = resolveBackend(id);
      if (!backend) continue;
      try {
        const attemptSignal = AbortSignal.any([outerSignal, AbortSignal.timeout(opts.timeoutMs)]);
        const { token } = createCancelToken(attemptSignal);
        const r = await tryDescribeOnce(backend, cfg, system, user, boundedInput, token);
        if (r.ok) return r;
        // 'unavailable' means the backend opted out, so a real failure keeps the reason.
        if (r.reason !== 'unavailable') {
          lastReason = r.reason;
          if (++answers >= maxAnswers) break;
        }
      } catch (e) {
        debugCatch(e, `background.describeChange.${id}`);
        continue;
      }
      // Re-check after the await: the outer budget can run out mid-attempt.
      if (isAborted()) {
        lastReason = 'outer budget exhausted';
        break;
      }
    }
  } finally {
    release();
  }

  return { ok: false, reason: lastReason };
}
