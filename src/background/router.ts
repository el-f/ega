import type {
  BackendId,
  CustomLanguage,
  PageContext,
  ResultAttempt,
  ResultMeta,
  Settings,
  TranslationChunk,
  TranslationRequest,
} from '@/shared/types';
import { pushPerfEntry } from '@/shared/perf-history';
import { makeDoneChunk, parseJsonResponse, type TranslationBackend } from '@/shared/backends/base';
import type { CacheEntry } from './cache';
import { buildOcrPrompt } from '@/shared/ocr-prompt';
import type { Logger } from '@/shared/logger';
import { debugCatch } from '@/shared/logger';
import { TIMEOUT_GRACE_MS } from '@/shared/stuck-timeout';
import {
  CANCEL_PRE_REG_CAP,
  DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS,
  DEFAULT_TRANSLATE_TIMEOUT_MS,
  IMAGE_TURN_PLACEHOLDER,
} from '@/shared/constants';

/** A note is guidance for the OCR pass, so it stays short beside untrusted image text. */
const IMAGE_NOTE_CAP = 200;
import { createProbeCache } from './probe-cache';
import {
  boundedChain,
  createChainResolver,
  describeEmptyChain,
  describeTextOnlyModel,
} from './router-chain';
import { fetchImageForVision, type FetchedImage } from './router-image';
import {
  buildSystemAndUser,
  createContextResolver,
  rendersPageContext,
  targetLabelFor,
  UnknownTaskError,
  type TranslateCtx,
} from './router-context';
import { withTranslateLifecycle, LifecycleCeilingError } from './router-lifecycle';
import { trackInflight } from './swKeepalive';
import { pushAuditEntry, type AuditSurface } from '@/shared/audit-log';
import { resolveModelId, type CustomTask } from '@/shared/settings-schema';
import { omitUndef } from '@/shared/utils/omitUndef';
import type { ImageTask, Task } from '@/shared/task-prompts';
import { createTranslateFsm } from './router-fsm';
import { runTranslateAttempt } from './router-attempt';
import { createCancelToken, type CancelToken } from '@/shared/cancel-token';
import {
  createTerminalLatch,
  IMAGE_TIMED_OUT,
  TRANSLATE_TIMED_OUT,
  type ChunkSink,
} from './router-chunks';

export interface RouterDeps {
  backends: TranslationBackend[];
  getSettings: () => Promise<Settings>;
  getCustomLanguages?: () => Promise<CustomLanguage[]>;
  getCustomTasks?: () => Promise<CustomTask[]>;
  cache: {
    get(key: string): Promise<CacheEntry | undefined>;
    set(key: string, v: Omit<CacheEntry, 'ts'>, generation?: number): Promise<void>;
    /** Read before the run, handed back to `set`, which drops the write when a
     *  `clear()` landed in between. */
    generation?(): number;
  };
  logger: Logger;
  /** Wall-clock translate budget (ms). Omit for the default. */
  translateTimeoutMs?: number;
  /** Wall-clock image-translate budget (ms). Omit for the default. */
  imageTranslateTimeoutMs?: number;
}

/** What a context-menu image click knows; the languages and modifiers come from settings. */
export interface ImageMenuRequest {
  id: string;
  imageUrl: string;
  /** Caption or notes beside the image. */
  text?: string;
  context?: PageContext;
  targetLang?: string;
}

interface RunMeta {
  surface?: AuditSurface;
  /** A menu image click has no text to fall back to, so an empty vision chain is UNSUPPORTED. */
  requireVision?: boolean;
}

/** A request with explain=true and no task is the explain task (rules, audit and reasoning effort read it); an image request with no task is OCR translate. */
function withResolvedTask(req: TranslationRequest): TranslationRequest {
  if (req.options.task !== undefined) return req;
  const task: Task | undefined =
    req.options.explain === true
      ? 'explain'
      : req.options.imageUrl !== undefined
        ? 'translate'
        : undefined;
  return task === undefined ? req : { ...req, options: { ...req.options, task } };
}

const UNKNOWN_TASK_MESSAGE = 'This task no longer exists. Pick another task.';

const NO_VISION_BACKEND_MESSAGE =
  'No backend that reads images is set up. Open Settings → Backends and set up one that supports images.';

export function createRouter(deps: RouterDeps) {
  const inflight = new Map<string, AbortController>();
  const probeCache = createProbeCache();
  const fallbackTranslateTimeoutMs = deps.translateTimeoutMs ?? DEFAULT_TRANSLATE_TIMEOUT_MS;
  const fallbackImageTranslateTimeoutMs =
    deps.imageTranslateTimeoutMs ?? DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS;
  // Buffers a cancel that arrives before its controller registers; capped so cancels for ids that never arrive cannot grow.
  const cancelRequested = new Set<string>();
  // Ids accepted but not yet registered in `inflight` — settings, cache and probe reads all run before registration.
  const started = new Set<string>();
  // Same cache key already running: the second request waits for the first and reads its answer instead of paying for it twice.
  const inflightByKey = new Map<string, Promise<void>>();
  const resolveBackends = createChainResolver(deps.backends, probeCache);
  const resolveTranslateContext = createContextResolver({
    getSettings: deps.getSettings,
    ...(deps.getCustomLanguages ? { getCustomLanguages: deps.getCustomLanguages } : {}),
    ...(deps.getCustomTasks ? { getCustomTasks: deps.getCustomTasks } : {}),
    logger: deps.logger,
    fallbackTranslateTimeoutMs,
  });

  function claimKey(key: string): () => void {
    let settle!: () => void;
    const claim = new Promise<void>((resolve) => {
      settle = resolve;
    });
    inflightByKey.set(key, claim);
    return () => {
      if (inflightByKey.get(key) === claim) inflightByKey.delete(key);
      settle();
    };
  }

  /** Parks a duplicate request on the run that already owns its cache key, and stays
   *  registered in `inflight` while it waits so cancel and cancel-all still reach it. */
  async function waitForLeader(
    reqId: string,
    key: string,
    leader: Promise<void>,
  ): Promise<CacheEntry | 'cancelled' | undefined> {
    return withTranslateLifecycle(
      { reqId, inflight, cancelRequested, trackInflight },
      async ({ ctrl }) => {
        await Promise.race([
          leader,
          new Promise<void>((resolve) => {
            if (ctrl.signal.aborted) resolve();
            else ctrl.signal.addEventListener('abort', () => resolve(), { once: true });
          }),
        ]);
        if (ctrl.signal.aborted) return 'cancelled';
        return deps.cache.get(key);
      },
    );
  }

  /** Fail closed. A request that ends without a terminal chunk leaves the
   *  surface spinning forever, so any unexpected throw becomes one. */
  async function withTerminalGuard(
    reqId: string,
    onChunkRaw: (c: TranslationChunk) => void,
    run: (emit: (c: TranslationChunk) => void) => Promise<void>,
  ): Promise<void> {
    const sink: ChunkSink = createTerminalLatch(onChunkRaw);
    const emit = (c: TranslationChunk): void => {
      sink.emit(c);
    };
    started.add(reqId);
    try {
      await run(emit);
    } catch (e) {
      deps.logger.error('request ended without a terminal chunk', e);
      emit({
        type: 'error',
        requestId: reqId,
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      started.delete(reqId);
      // A run that never registered a controller (cache hit, no backend) leaves its buffered cancel behind, and it would abort the next request reusing the id.
      cancelRequested.delete(reqId);
    }
  }

  async function handleTranslate(
    req: TranslationRequest,
    onChunkRaw: (c: TranslationChunk) => void,
    meta: RunMeta = {},
  ): Promise<void> {
    await withTerminalGuard(req.id, onChunkRaw, (emit) => runTranslate(req, emit, meta));
  }

  async function runTranslate(
    reqIn: TranslationRequest,
    onChunkRaw: (c: TranslationChunk) => void,
    meta: RunMeta,
  ) {
    const req = withResolvedTask(reqIn);
    // Read before the settings are: a flush landing mid-request must invalidate this run's write.
    const cacheGeneration = deps.cache.generation?.();
    let ctx: TranslateCtx;
    try {
      ctx = await resolveTranslateContext(req, onChunkRaw);
    } catch (e) {
      if (!(e instanceof UnknownTaskError)) throw e;
      // REQUEST carries no settings tab: no setting brings a deleted task back.
      onChunkRaw({
        type: 'error',
        requestId: req.id,
        code: 'REQUEST',
        message: UNKNOWN_TASK_MESSAGE,
      });
      return;
    }
    const { s, cfg, translateTimeoutMs, onChunk, requestedTask, reqOptions, reqView, key } = ctx;
    const captureMeta = s.captureResultMeta !== false;
    const metaStart = performance.now();
    const t0 = Date.now();
    const fsm = createTranslateFsm();

    function emitAudit(args: {
      backend: BackendId | 'auto' | 'unknown';
      systemPrompt: string;
      userPrompt: string;
      response: string;
      cacheHit: boolean;
      error?: { code: string; message: string };
      confidence?: number;
    }): void {
      const latencyMs = Date.now() - t0;
      const { firstDeltaAt, finalUsage } = fsm.context();
      const firstTokenMs =
        firstDeltaAt !== undefined ? Math.max(0, firstDeltaAt - metaStart) : undefined;
      const modelId = resolveModelId(cfg.model, args.backend);
      // Failed rows too, under the same meta switch; a user cancel or a chain that never ran is not backend latency.
      if (
        captureMeta &&
        args.error !== undefined &&
        args.error.code !== 'ABORTED' &&
        args.backend !== 'unknown'
      ) {
        pushPerfEntry({
          backendId: args.backend === 'auto' ? 'unknown' : args.backend,
          cacheHit: args.cacheHit,
          latencyMs,
          sourceLang: String(req.sourceLang),
          targetLang: String(req.targetLang),
          ...omitUndef({ firstTokenMs }),
          error: args.error.code,
        });
      }
      void pushAuditEntry({
        task: requestedTask,
        ...(reqOptions.batch === true ? { batch: true } : {}),
        sourceLang: String(req.sourceLang),
        targetLang: String(req.targetLang),
        backend: args.backend,
        model: modelId,
        systemPrompt: args.systemPrompt,
        userPrompt: args.userPrompt,
        response: args.response,
        latencyMs,
        cacheHit: args.cacheHit,
        requestId: req.id,
        ...omitUndef({
          firstTokenMs,
          inputTokens: finalUsage?.inputTokens,
          outputTokens: finalUsage?.outputTokens,
          error: args.error,
          confidence: args.confidence,
          surface: meta.surface,
        }),
      }).catch(() => {});
    }
    const attemptLog: ResultAttempt[] = [];
    let historyTurns = 0;
    let pageContextSent = false;
    let imageArm: ResultMeta['imageArm'];

    function attachMeta(
      chunk: TranslationChunk,
      backendId: BackendId | 'unknown',
      cacheHit: boolean,
    ): TranslationChunk {
      if (!captureMeta || chunk.type !== 'done') return chunk;
      const latencyMs = performance.now() - metaStart;
      const { firstDeltaAt } = fsm.context();
      const usage = chunk.usage;
      const meta: ResultMeta = {
        backendId,
        cacheHit,
        latencyMs,
        sourceLang: String(req.sourceLang),
        targetLang: String(req.targetLang),
        ...omitUndef({
          firstTokenMs:
            firstDeltaAt !== undefined ? Math.max(0, firstDeltaAt - metaStart) : undefined,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          cacheReadTokens: usage?.cacheReadTokens,
          cacheWriteTokens: usage?.cacheWriteTokens,
          reasoningTokens: usage?.reasoningTokens,
        }),
        ...(attemptLog.length > 1 ? { attempts: [...attemptLog] } : {}),
        // 0 on the image arm, which sends no history. A cache hit keeps the count: its key hashes the history.
        historyTurns,
        pageContextSent,
        ...(imageArm ? { imageArm } : {}),
      };
      try {
        pushPerfEntry(meta);
      } catch (e) {
        debugCatch(e, 'background.router.1');
      }
      return { ...chunk, meta };
    }

    function failWithoutBackend(code: 'NO_BACKEND' | 'UNSUPPORTED', message: string): void {
      onChunk({ type: 'error', requestId: req.id, code, message });
      emitAudit({
        backend: 'unknown',
        systemPrompt: '',
        userPrompt: '',
        response: '',
        cacheHit: false,
        error: { code, message },
      });
    }

    // Only a task that takes images reads one; any other task ignores a carried-over one.
    const imageUrl = req.options.imageUrl;
    let visionChain: TranslationBackend[] = [];
    if (imageUrl !== undefined && ctx.view.image) {
      visionChain = boundedChain(await resolveBackends(s, cfg, 'translateImage'), s).filter(
        (b) => b.translateImage !== undefined,
      );
      if (visionChain.length === 0) {
        // A chain that has an image backend running a text-only model fails here, caption or not: the fix is the model.
        const textOnly = await describeTextOnlyModel(s, cfg, deps.backends);
        if (textOnly !== null || meta.requireVision) {
          failWithoutBackend('UNSUPPORTED', textOnly ?? NO_VISION_BACKEND_MESSAGE);
          return;
        }
      }
    }
    // An image with no image backend at all falls through to the text path.
    const visionUrl = visionChain.length > 0 ? imageUrl : undefined;
    historyTurns = visionUrl === undefined ? (req.options.conversationHistory?.length ?? 0) : 0;
    if (imageUrl !== undefined) {
      imageArm =
        visionUrl === undefined
          ? 'text'
          : requestedTask === 'translate' && !reqOptions.explain
            ? 'ocr'
            : 'task';
    }
    // The OCR prompt takes no page info; every other prompt renders it only through a slot or the slotless block.
    pageContextSent = imageArm !== 'ocr' && rendersPageContext(ctx);
    // With no caption the text path would get only the "[image]" marker and translate that.
    if (imageUrl !== undefined && visionUrl === undefined) {
      const caption = req.text === IMAGE_TURN_PLACEHOLDER ? '' : req.text.trim();
      if (caption === '') {
        failWithoutBackend('UNSUPPORTED', NO_VISION_BACKEND_MESSAGE);
        return;
      }
    }

    // A cached entry without `explain` cannot serve a request that wants it, so treat it as a miss and rewrite both fields.
    const usableHit = (hit: CacheEntry | undefined): hit is CacheEntry =>
      hit !== undefined && (!reqOptions.explain || hit.explain !== undefined);
    const serveFromCache = (hit: CacheEntry): void => {
      // Live-path envelope: a bare `{`-leading translation renders blank.
      onChunk({
        type: 'delta',
        requestId: req.id,
        text: JSON.stringify({ translation: hit.translation }),
      });
      onChunk(attachMeta(makeDoneChunk(req.id, hit), 'unknown', true));
      emitAudit({
        backend: 'unknown',
        systemPrompt: '',
        userPrompt: '',
        response: hit.translation,
        cacheHit: true,
        ...omitUndef({ confidence: hit.confidence }),
      });
    };

    // Images never touch the text cache: two images share the placeholder-text key.
    const useCache = s.cacheEnabled && visionUrl === undefined;
    let releaseKey: (() => void) | undefined;
    if (useCache) {
      const hit = await deps.cache.get(key);
      if (usableHit(hit)) {
        serveFromCache(hit);
        return;
      }
      const leader = inflightByKey.get(key);
      // A re-issued id supersedes its own earlier run, so it must never park behind it.
      if (leader && !inflight.has(req.id)) {
        const handover = await waitForLeader(req.id, key, leader);
        if (handover === 'cancelled') {
          onChunk({ type: 'error', requestId: req.id, code: 'ABORTED', message: 'cancelled' });
          return;
        }
        if (usableHit(handover)) {
          serveFromCache(handover);
          return;
        }
        // The leader ended with no answer, so this run pays for it; claim the key or every later duplicate pays too.
        if (!inflightByKey.has(key)) releaseKey = claimKey(key);
      } else if (!leader) {
        releaseKey = claimKey(key);
      }
    }

    try {
      const chain =
        visionUrl !== undefined
          ? visionChain
          : boundedChain(await resolveBackends(s, cfg, 'translate'), s);
      if (chain.length === 0) {
        const message = describeEmptyChain(s, cfg, deps.backends);
        deps.logger.warn(`no backend for ${requestedTask}: ${message}`);
        failWithoutBackend('NO_BACKEND', message);
        return;
      }

      // The marker stands in for "no text"; neither image arm may show it to the model.
      const imageText = req.text === IMAGE_TURN_PLACEHOLDER ? '' : req.text;
      const { system, user } =
        // Only Translate reads an image with the OCR prompt; any other task sends its own prompt with the image.
        visionUrl !== undefined && requestedTask === 'translate' && !reqOptions.explain
          ? buildOcrPrompt(
              targetLabelFor(s, ctx.customs, String(req.targetLang)),
              imageText.trim().slice(0, IMAGE_NOTE_CAP) || undefined,
            )
          : visionUrl !== undefined
            ? buildSystemAndUser({ ...ctx, reqView: { ...reqView, text: imageText } }, req)
            : // The very prompt the cache key hashed.
              ctx.prompt;
      const wallclockMs =
        visionUrl !== undefined
          ? (s.imageTranslateTimeoutMs ?? fallbackImageTranslateTimeoutMs)
          : translateTimeoutMs;
      // Explain-with-image runs under the image timeout too, so it names that setting.
      const timedOutMessage = visionUrl === undefined ? TRANSLATE_TIMED_OUT : IMAGE_TIMED_OUT;
      const timedOut = (): void => {
        fsm.send({ type: 'error', code: 'TIMEOUT', message: timedOutMessage });
        onChunk({ type: 'error', requestId: req.id, code: 'TIMEOUT', message: timedOutMessage });
      };

      fsm.send({ type: 'start' });
      // The ceiling fires only when the op ignores abort; the renderers' stuck guards add the same grace.
      const lifecycleCeilingMs = wallclockMs + TIMEOUT_GRACE_MS;
      // A vision download that fails before any provider call is charged to no backend.
      let imageFetchFailed = false;
      let cancelToken: CancelToken | undefined;
      try {
        imageFetchFailed = await withTranslateLifecycle(
          {
            reqId: req.id,
            inflight,
            cancelRequested,
            trackInflight,
            maxLifecycleMs: lifecycleCeilingMs,
          },
          async ({ ctrl }) => {
            const { token, cancel } = createCancelToken(ctrl.signal);
            cancelToken = token;
            let image: FetchedImage | undefined;
            if (visionUrl !== undefined) {
              // Inside the lifecycle so a mid-download cancel tears the fetch down; the wall clock starts after it.
              const fetched = await fetchImageForVision(visionUrl, token.signal);
              if (!fetched.ok) {
                fsm.send({ type: 'error', code: fetched.code, message: fetched.message });
                onChunk({
                  type: 'error',
                  requestId: req.id,
                  code: fetched.code,
                  message: fetched.message,
                });
                return true;
              }
              image = fetched.image;
            }
            const timeoutHandle = setTimeout(() => {
              cancel('wallclock');
            }, wallclockMs);
            try {
              for (let i = 0; i < chain.length; i++) {
                const backend = chain[i];
                if (!backend) continue;
                const outcome = await runTranslateAttempt({
                  backend,
                  isLast: i === chain.length - 1,
                  reqView,
                  reqOptions,
                  streaming: s.streaming,
                  cfg,
                  system,
                  user,
                  ...(req.options.conversationHistory
                    ? { history: req.options.conversationHistory }
                    : {}),
                  ...(image ? { image } : {}),
                  timedOutMessage,
                  cancel: token,
                  fsm,
                  attemptLog,
                  reqId: req.id,
                  onChunk,
                  attachMeta,
                  logger: deps.logger,
                });
                if (outcome.kind !== 'transient_error_falling_through') break;
              }
            } finally {
              clearTimeout(timeoutHandle);
              // Skip when a terminal already went out: the attempt rewrites its own ABORTED to TIMEOUT, so this would emit twice.
              if (
                token.reason === 'wallclock' &&
                fsm.state() !== 'completed' &&
                fsm.state() !== 'erroring'
              ) {
                timedOut();
              }
            }
            return false;
          },
        );
      } catch (e) {
        if (!(e instanceof LifecycleCeilingError)) throw e;
        // A run that already answered is left alone: the fsm ignores this and the sink drops it.
        timedOut();
      }
      // A cloud backend's ABORTED chunk lands after the abort race resolves, so the row would read as a blank success.
      if (fsm.state() === 'attempting' && cancelToken?.reason === 'user') {
        fsm.send({ type: 'error', code: 'ABORTED', message: 'cancelled' });
      }

      const lastAttempt = attemptLog[attemptLog.length - 1];
      // No provider was contacted, so the row names none; a wallclock timeout still charges the backend it hung on.
      const usedBackendId = imageFetchFailed
        ? 'unknown'
        : (lastAttempt?.backendId ?? chain[0]?.id ?? 'unknown');
      const completed = fsm.state() === 'completed';
      const fctx = fsm.context();
      const finalTranslation = completed ? parseJsonResponse(fctx.acc).translation : '';
      emitAudit({
        backend: usedBackendId,
        systemPrompt: system,
        userPrompt: user,
        response: finalTranslation,
        cacheHit: false,
        ...(fctx.finalError ? { error: fctx.finalError } : {}),
        ...(completed ? omitUndef({ confidence: fctx.finalConfidence }) : {}),
      });

      if (!completed) return;

      try {
        if (finalTranslation && useCache) {
          await deps.cache.set(
            key,
            {
              translation: finalTranslation,
              ...omitUndef({
                confidence: fctx.finalConfidence,
                detectedLang: fctx.finalDetectedLang,
                detectedDetail: fctx.finalDetectedDetail,
                detectedLangs: fctx.finalDetectedLangs,
                explain: fctx.finalExplain,
              }),
            },
            cacheGeneration,
          );
        }
      } catch (e) {
        deps.logger.warn('post-flight persist failed', e);
      }
    } finally {
      releaseKey?.();
    }
  }

  /** The one translator from a menu click to the request shape the text path already runs. */
  async function imageMenuRequest(
    req: ImageMenuRequest,
    task: ImageTask,
  ): Promise<TranslationRequest> {
    const targetLang = req.targetLang ?? String((await deps.getSettings()).defaultTargetLang);
    return {
      id: req.id,
      text: req.text ?? '',
      sourceLang: 'auto',
      targetLang: targetLang as TranslationRequest['targetLang'],
      ...(req.context ? { context: req.context } : {}),
      options: {
        stream: false,
        explain: task === 'explain',
        ...(task === 'explain' ? { task } : {}),
        imageUrl: req.imageUrl,
      },
    };
  }

  async function handleImageTranslate(
    req: ImageMenuRequest,
    onChunkRaw: (c: TranslationChunk) => void,
  ): Promise<void> {
    await withTerminalGuard(req.id, onChunkRaw, async (emit) =>
      runTranslate(await imageMenuRequest(req, 'translate'), emit, { requireVision: true }),
    );
  }

  async function handleImageExplain(
    req: ImageMenuRequest,
    onChunkRaw: (c: TranslationChunk) => void,
  ): Promise<void> {
    await withTerminalGuard(req.id, onChunkRaw, async (emit) =>
      runTranslate(await imageMenuRequest(req, 'explain'), emit, { requireVision: true }),
    );
  }

  function cancel(requestId: string) {
    const c = inflight.get(requestId);
    if (c) {
      c.abort();
    } else {
      // Cancel arrived before the controller was registered — buffer for the
      // next registration. Set iteration is insertion-ordered; drop oldest at cap.
      cancelRequested.add(requestId);
      while (cancelRequested.size > CANCEL_PRE_REG_CAP) {
        const first = cancelRequested.values().next().value;
        if (first === undefined) break;
        cancelRequested.delete(first);
      }
    }
  }

  /** Aborts every tracked request (the panel's Cancel all) and returns how many it aborted. */
  function cancelAll(): number {
    let count = 0;
    for (const ctrl of inflight.values()) {
      if (!ctrl.signal.aborted) {
        ctrl.abort();
        count += 1;
      }
    }
    // A run still reading settings or probing backends has no controller yet; buffer the cancel so its registration aborts at once.
    for (const id of started) {
      if (!inflight.has(id)) {
        cancel(id);
        count += 1;
      }
    }
    return count;
  }

  return {
    handleTranslate,
    handleImageTranslate,
    handleImageExplain,
    cancel,
    cancelAll,
    /** Bust the probe-cache so a freshly-installed backend / API key is
     *  available without waiting out the TTL. SW wires to settings:onChanged. */
    clearProbes: () => probeCache.clear(),
  };
}
