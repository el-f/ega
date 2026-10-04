import {
  emitTerminal,
  type BackendConfig,
  type TranslateCallArgs,
  type TranslateImageArgs,
  type TranslationBackend,
} from './base';
import {
  ALL_ERR_CODES,
  type BackendId,
  type ErrCode,
  type TokenUsage,
  type TranslationChunk,
} from '../types';
import { asBackendIdUnsafe } from '../brands';
import { backendLabel } from './provider-profiles';
import type { BackendCapabilities } from './base';
import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS, NATIVE_FIRST_FRAME_TIMEOUT_MS } from '../constants';
import { OCR_SYSTEM_PROMPT, OCR_USER_INSTRUCTION } from '../ocr-prompt';
import {
  send as sendNativeFrame,
  cancel as cancelNativeFrame,
  ping as pingNativePort,
} from '@/shared/cli-session/port-manager';
import type { CancelToken } from '../cancel-token';
import { STREAM_IDLE_TIMEOUT_MS } from './stream-resilience';
import { DEFAULT_NATIVE_CLI } from '../native-cli-registry';
import { resolveModelId } from '../settings-schema';

// Claude Code plans to make --bare (API key only, no subscription login) the `claude -p` default.
const CLAUDE_UPDATE_HINT = ' If you are logged in, a Claude Code update can also cause this.';

interface HostMsg {
  v: 1;
  id: string;
  type: 'delta' | 'done' | 'error' | 'warn' | 'alive';
  text?: string;
  code?: string;
  message?: string;
  /** Host v4+: token counts the CLI reported; untrusted shape. */
  usage?: unknown;
}

/** Keeps only numeric counts, so a malformed frame cannot put junk in the Inspector. */
function hostUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const out: TokenUsage = {
    ...(num(u['inputTokens']) ? { inputTokens: u['inputTokens'] } : {}),
    ...(num(u['outputTokens']) ? { outputTokens: u['outputTokens'] } : {}),
    ...(num(u['cacheReadTokens']) ? { cacheReadTokens: u['cacheReadTokens'] } : {}),
    ...(num(u['cacheWriteTokens']) ? { cacheWriteTokens: u['cacheWriteTokens'] } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The CLI model the request names; '' leaves the CLI's own default. */
function nativeModel(cfg: BackendConfig): string {
  return resolveModelId(cfg.model, 'native');
}

// Derived, not duplicated, so a new retryable code cannot be missing here.
function asErrCode(v: string | undefined): ErrCode {
  return v && (ALL_ERR_CODES as readonly string[]).includes(v) ? (v as ErrCode) : 'UNKNOWN';
}

/** NATIVE_NOT_INSTALLED only for a host that never started (missing registry entry, wrong origin); anything else is NATIVE_SPAWN_FAIL. */
function classifyDisconnect(msg: string | undefined): 'NATIVE_NOT_INSTALLED' | 'NATIVE_SPAWN_FAIL' {
  if (!msg) return 'NATIVE_SPAWN_FAIL';
  if (/forbidden|allowed_origins/i.test(msg)) return 'NATIVE_NOT_INSTALLED';
  if (/not found|does not exist/i.test(msg)) return 'NATIVE_NOT_INSTALLED';
  return 'NATIVE_SPAWN_FAIL';
}

export class NativeBackend implements TranslationBackend {
  readonly id: BackendId = asBackendIdUnsafe('native');

  readonly manifest: BackendCapabilities = {
    id: this.id,
    name: backendLabel('native'),
    capabilities: { canVision: true },
  };

  // Shared port, or two clicks in a row spawn two hosts and the second races the
  // first one's .cmd-launcher teardown into a timeout.
  async isAvailable(cfg: BackendConfig): Promise<boolean> {
    const timeoutMs = cfg.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS;
    return pingNativePort(timeoutMs);
  }

  translate(a: TranslateCallArgs): Promise<void> {
    // The host protocol carries one user string; earlier turns ride inside it as a transcript (already fenced by the worker).
    const transcript = (a.history ?? [])
      .map((h) => `${h.role === 'assistant' ? 'Assistant' : 'User'}: ${h.content}`)
      .join('\n\n');
    const user = transcript ? `Conversation so far:\n${transcript}\n\nNow:\n${a.user}` : a.user;
    return this.streamOverPort(a.req.id, a.cancel, a.onChunk, {
      v: 1,
      kind: 'translate',
      id: a.req.id,
      prompt: { system: a.system, user },
      stream: a.stream,
      ...(a.config.nativeCli ? { backend: a.config.nativeCli } : {}),
      ...(nativeModel(a.config) ? { model: nativeModel(a.config) } : {}),
    });
  }

  /** Uses the shared port: a private connectNative would spawn a second host that races the first one's teardown. */
  translateImage(a: TranslateImageArgs): Promise<void> {
    return this.streamOverPort(a.requestId, a.cancel, a.onChunk, {
      v: 1,
      kind: 'translateImage',
      id: a.requestId,
      imageBase64: a.imageBase64,
      mediaType: a.mediaType,
      prompt: {
        system: a.system ?? OCR_SYSTEM_PROMPT,
        user: a.user ?? OCR_USER_INSTRUCTION,
      },
      ...(a.config.nativeCli ? { backend: a.config.nativeCli } : {}),
      // Empty means the CLI default.
      ...(nativeModel(a.config) ? { model: nativeModel(a.config) } : {}),
    });
  }

  // One streaming frame-loop for text and image over the shared port.
  private streamOverPort(
    requestId: string,
    cancel: CancelToken,
    onChunk: (c: TranslationChunk) => void,
    frame: Record<string, unknown>,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      if (cancel.signal.aborted) {
        onChunk({
          type: 'error',
          requestId,
          code: 'ABORTED',
          message: 'cancelled before dispatch',
        });
        return resolve();
      }

      let raw = '';
      // `finished` mutates inside abort/frame callbacks, which TS literal narrowing does not track.
      let finished = false;
      let unsubscribe: () => void = () => {};
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      // Same idle budget as the HTTP streams: a CLI that stops mid-answer must not hang until the router's wallclock.
      let idle: ReturnType<typeof setTimeout> | undefined;
      const bumpIdle = (): void => {
        if (idle !== undefined) clearTimeout(idle);
        idle = setTimeout(() => {
          cancelNativeFrame(requestId);
          finish({
            type: 'error',
            requestId,
            code: 'TIMEOUT',
            message: 'The native CLI stopped before the reply finished. Try again.',
          });
        }, STREAM_IDLE_TIMEOUT_MS);
      };

      const finish = (c: TranslationChunk): void => {
        if (finished) return;
        finished = true;
        if (watchdog !== undefined) clearTimeout(watchdog);
        if (idle !== undefined) clearTimeout(idle);
        unsubscribe();
        cancel.signal.removeEventListener('abort', onAbort);
        onChunk(c);
        resolve();
      };

      const onAbort = (): void => {
        cancelNativeFrame(requestId);
        finish({ type: 'error', requestId, code: 'ABORTED', message: 'cancelled' });
      };
      cancel.signal.addEventListener('abort', onAbort, { once: true });

      // A host that pings but never answers would hang until the router's wallclock, hiding the error that rotated here.
      watchdog = setTimeout(() => {
        // Cancel host-side too, or a wedged CLI child keeps the session slot occupied.
        cancelNativeFrame(requestId);
        finish({
          type: 'error',
          requestId,
          code: 'NATIVE_SPAWN_FAIL',
          message: 'native host did not respond',
        });
      }, NATIVE_FIRST_FRAME_TIMEOUT_MS);

      unsubscribe = sendNativeFrame(
        frame,
        (m: unknown) => {
          const msg = m as HostMsg;
          if (msg.id !== requestId) return;
          // First matching frame proves the host is answering — the idle guard takes over from the watchdog.
          if (watchdog !== undefined) {
            clearTimeout(watchdog);
            watchdog = undefined;
          }
          bumpIdle();
          if (msg.type === 'delta' && msg.text) {
            raw += msg.text;
            onChunk({ type: 'delta', requestId, text: msg.text });
          } else if (msg.type === 'done') {
            const usage = hostUsage(msg.usage);
            emitTerminal(finish, requestId, 'The native CLI', raw, usage ? { usage } : {});
          } else if (msg.type === 'warn') {
            if (typeof console !== 'undefined') {
              console.warn(`[native] ${msg.code ?? 'WARN'}: ${msg.message ?? ''}`);
            }
          } else if (msg.type === 'error') {
            const code = asErrCode(msg.code);
            const message = msg.message ?? 'native error';
            const claude = (frame['backend'] ?? DEFAULT_NATIVE_CLI) === 'claude';
            finish({
              type: 'error',
              requestId,
              code,
              message: code === 'AUTH' && claude ? message + CLAUDE_UPDATE_HINT : message,
            });
          }
        },
        // A mid-translate host death sends no terminal frame, so fail fast here.
        (reason) => {
          finish({
            type: 'error',
            requestId,
            code: classifyDisconnect(reason),
            message: reason ?? 'native host disconnected',
          });
        },
      );
    });
  }
}
