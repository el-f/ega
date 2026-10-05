import {
  ALL_ERR_CODES,
  type BackendId,
  type ErrCode,
  type ResultAttempt,
  type TranslationChunk,
  type TranslationRequest,
} from '@/shared/types';
import type { BackendConfig, TranslationBackend } from '@/shared/backends/base';
import type { ChatTurn } from '@/shared/chat-history';
import { optionsTabForMessage, shouldRotate } from '@/shared/error-policy';
import { errCodeLabel } from '@/shared/err-labels';
import { createThinkScrubber } from '@/shared/backends/think-scrubber';
import type { Logger } from '@/shared/logger';
import type { CancelToken } from '@/shared/cancel-token';
import type { createTranslateFsm } from './router-fsm';
import type { FetchedImage } from './router-image';
import { TRANSLATE_TIMED_OUT } from './router-chunks';

export type AttemptOutcome =
  | { kind: 'completed' }
  | { kind: 'transient_error_falling_through' }
  | { kind: 'final_error_emitted' }
  | { kind: 'timed_out' };

export interface AttemptDeps {
  backend: TranslationBackend;
  isLast: boolean;
  reqView: TranslationRequest;
  reqOptions: TranslationRequest['options'];
  streaming: boolean;
  cfg: BackendConfig;
  system: string;
  user: string;
  history?: ChatTurn[];
  /** Set for a vision attempt: the backend's `translateImage` runs on it instead of `translate`. */
  image?: FetchedImage;
  /** Wording of the TIMEOUT the wall-clock rewrite emits. */
  timedOutMessage?: string;
  cancel: CancelToken;
  fsm: ReturnType<typeof createTranslateFsm>;
  attemptLog: ResultAttempt[];
  reqId: string;
  onChunk: (c: TranslationChunk) => void;
  attachMeta: (
    chunk: TranslationChunk,
    backendId: BackendId | 'unknown',
    cacheHit: boolean,
  ) => TranslationChunk;
  logger: Logger;
}

const asErrCode = (v: string | undefined): ErrCode =>
  v !== undefined && (ALL_ERR_CODES as readonly string[]).includes(v) ? (v as ErrCode) : 'UNKNOWN';

const firstLine = (m: string): string => m.split('\n', 1)[0] ?? m;

/** Line 1: the first failure a setting can fix, else the last one. Line 2: each backend's failure. */
function chainErrorMessage(
  errors: readonly ResultAttempt[],
  last: { code: ErrCode; message: string },
): string {
  const fixable = errors.find(
    (e) => optionsTabForMessage(e.message ?? '', asErrCode(e.code)) !== undefined,
  );
  const earlier = fixable === errors.at(-1) ? undefined : fixable;
  const sentence = firstLine(earlier?.message ?? last.message);
  // Every surface prefixes the LAST code's label, so a lead from an earlier attempt names its own.
  const lead =
    earlier === undefined || earlier.code === last.code
      ? sentence
      : `${errCodeLabel(asErrCode(earlier.code))} (${earlier.backendId}). ${sentence}`;
  const list = errors.map((e) => `${e.backendId}: ${errCodeLabel(asErrCode(e.code))}`).join(' · ');
  return `${lead}\n${list}`;
}

export async function runTranslateAttempt(deps: AttemptDeps): Promise<AttemptOutcome> {
  const {
    backend,
    isLast,
    reqView,
    reqOptions,
    streaming,
    cfg,
    system,
    user,
    history,
    image,
    timedOutMessage = TRANSLATE_TIMED_OUT,
    cancel,
    fsm,
    attemptLog,
    reqId,
    onChunk,
    attachMeta,
    logger,
  } = deps;

  let sawTransientError = false;
  let sawDeltas = false;
  const attemptStart = performance.now();
  // Every backend's deltas pass here, so stripping `<think>` once covers the visible stream and the cached final text.
  const scrubber = createThinkScrubber({ gemmaChannels: backend.id === 'localserver' });

  const emitDelta = (now: number, text: string): void => {
    if (text.length === 0) return;
    fsm.send({ type: 'delta', text, now });
    sawDeltas = true;
    onChunk({ type: 'delta', requestId: reqId, text });
  };

  // Race against cancel.signal, because a backend that ignores its AbortSignal would otherwise hang the router.
  const abortRace = new Promise<void>((resolve) => {
    if (cancel.signal.aborted) {
      resolve();
      return;
    }
    cancel.signal.addEventListener('abort', () => resolve(), { once: true });
  });
  const handleChunk = (c: TranslationChunk): void => {
    if (c.type === 'delta') {
      emitDelta(performance.now(), scrubber.push(c.text));
    } else if (c.type === 'done') {
      // A partial tag held back at stream end is real text — flush it.
      emitDelta(performance.now(), scrubber.flush());
      fsm.send({ type: 'done', chunk: c });
      const doneAt = performance.now();
      attemptLog.push({
        backendId: backend.id,
        status: 'ok',
        latencyMs: Math.round(doneAt - attemptStart),
      });
      // Only an explain grounded in the picture earns the "from image" marker.
      const done = image && reqOptions.explain ? { ...c, usedImage: true } : c;
      onChunk(attachMeta(done, backend.id, false));
    } else {
      // Rewrite ABORTED → TIMEOUT when the wall-clock fired so the
      // UI shows a real timeout instead of suppressing as cancel.
      if (c.code === 'ABORTED' && cancel.reason === 'wallclock') {
        fsm.send({ type: 'error', code: 'TIMEOUT', message: timedOutMessage });
        onChunk({
          type: 'error',
          requestId: reqId,
          code: 'TIMEOUT',
          message: timedOutMessage,
          backendId: backend.id,
        });
        return;
      }
      const errAt = performance.now();
      attemptLog.push({
        backendId: backend.id,
        status: 'error',
        code: c.code,
        message: c.message.slice(0, 400),
        latencyMs: Math.round(errAt - attemptStart),
      });
      // Once the user has seen partial text there is no clean way to take it back, so stop rotating and surface the error.
      const canRotate = shouldRotate(c.code);
      if (canRotate && !isLast && !sawDeltas) {
        sawTransientError = true;
        logger.info(`backend ${backend.id} transient error (${c.code}); falling back`);
      } else {
        // attemptLog already holds the current entry, so this summary covers the whole chain, not just the last attempt.
        const priorErrors = attemptLog.filter((e) => e.status === 'error');
        const message = priorErrors.length > 1 ? chainErrorMessage(priorErrors, c) : c.message;
        fsm.send({ type: 'error', code: c.code, message });
        onChunk({ ...c, message, backendId: backend.id });
      }
    }
  };
  try {
    // Called as methods: cloud backends read `this.apiKey` inside, so an unbound call throws.
    const call = image
      ? backend.translateImage
        ? backend.translateImage({
            imageBase64: image.imageBase64,
            mediaType: image.mediaType,
            requestId: reqId,
            cancel,
            config: cfg,
            system,
            user,
            onChunk: handleChunk,
          })
        : Promise.reject(new Error(`${backend.id} cannot read images`))
      : backend.translate({
          req: reqView,
          system,
          user,
          ...(history ? { history } : {}),
          stream: reqOptions.stream && streaming,
          cancel,
          config: cfg,
          onChunk: handleChunk,
        });
    await Promise.race([call, abortRace]);
  } catch (err) {
    // A throw means the adapter broke, not that the provider refused, so a non-last backend falls through even though an emitted UNKNOWN would not.
    const isAbort = cancel.signal.aborted || (err instanceof Error && err.name === 'AbortError');
    if (!isAbort && fsm.state() !== 'completed' && fsm.state() !== 'erroring') {
      const message = err instanceof Error ? err.message : String(err);
      attemptLog.push({
        backendId: backend.id,
        status: 'error',
        code: 'UNKNOWN',
        message: message.slice(0, 400),
        latencyMs: Math.round(performance.now() - attemptStart),
      });
      // sawDeltas mutates inside the onChunk closure, which TS cannot see from the outer `let = false`.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isLast && !sawDeltas) {
        sawTransientError = true;
        logger.info(`backend ${backend.id} threw (${message}); falling back`);
      } else {
        fsm.send({ type: 'error', code: 'UNKNOWN', message });
        onChunk({
          type: 'error',
          requestId: reqId,
          code: 'UNKNOWN',
          message,
          backendId: backend.id,
        });
      }
    }
    // isAbort: the wallclock / user cancel owns the terminal (router finally
    // for wallclock; the ABORTED-chunk path for a clean cancel). Fall through.
  }

  if (fsm.state() === 'completed') return { kind: 'completed' };
  if (!sawTransientError) {
    // A backend that resolved without a terminal chunk would strand the UI. The
    // invariant: exactly one terminal chunk reaches onChunk per non-transient outcome.
    if (fsm.state() !== 'erroring' && fsm.state() !== 'completed' && cancel.reason === undefined) {
      fsm.send({ type: 'error', code: 'UNKNOWN', message: 'backend resolved without terminal' });
      attemptLog.push({
        backendId: backend.id,
        status: 'error',
        code: 'UNKNOWN',
        message: 'backend resolved without terminal',
        latencyMs: Math.round(performance.now() - attemptStart),
      });
      onChunk({
        type: 'error',
        requestId: reqId,
        code: 'UNKNOWN',
        message: 'backend resolved without terminal',
        backendId: backend.id,
      });
    }
    return { kind: 'final_error_emitted' };
  }
  return cancel.reason === 'wallclock'
    ? { kind: 'timed_out' }
    : { kind: 'transient_error_falling_through' };
}
