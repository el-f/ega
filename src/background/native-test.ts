/** Must run in the SW: port-manager opens the native port in the caller's context, and only the SW copy feeds the status chip. */
import type { Msg, NativeTestReply } from '@/shared/messages';
import type { TranslationBackend } from '@/shared/backends/base';
import type { CancelTokenSource } from '@/shared/cancel-token';
import { asLangIdUnsafe, asLangPresetIdUnsafe, type LangSelection } from '@/shared/brands';
import { errCodeLabel } from '@/shared/err-labels';
import { trackInflight } from './swKeepalive';

type NativeTestMsg = Extract<Msg, { kind: 'native:test' }>;

export interface NativeTestDeps {
  resolveBackend: (id: string) => TranslationBackend | null;
  createCancelToken: (parent?: AbortSignal) => CancelTokenSource;
  defaultTimeoutMs: number;
}

const SYSTEM_PROMPT =
  'Translate the user message into English. Reply with the translation only — no preamble, no JSON, no markdown.';

/** Anything not shaped like a language tag is treated as a preset id. */
function asLangSelection(s: string): LangSelection {
  if (s === 'auto') return 'auto';
  if (/^[a-z]{2,3}(?:-[A-Za-z0-9-]+)?$/.test(s)) return asLangIdUnsafe(s);
  return asLangPresetIdUnsafe(s);
}

export async function handleNativeTest(
  msg: NativeTestMsg,
  sendResponse: (reply: NativeTestReply) => void,
  deps: NativeTestDeps,
): Promise<void> {
  const backend = deps.resolveBackend('native');
  if (!backend) {
    sendResponse({ ok: false, error: 'Native backend not registered' });
    return;
  }
  const start = performance.now();
  let firstDeltaAt: number | undefined;
  let accumulated = '';
  let errMsg: string | null = null;
  const cancelSrc = deps.createCancelToken(
    AbortSignal.timeout(msg.timeoutMs ?? deps.defaultTimeoutMs),
  );
  // A cold CLI spawn outlives Chrome's ~30s idle eviction, and an evicted worker never answers the caller.
  const release = trackInflight();
  try {
    await backend.translate({
      req: {
        id: `native-test-${Date.now()}`,
        text: msg.text,
        sourceLang: asLangSelection(msg.sourceLang),
        targetLang: asLangSelection(msg.targetLang),
        options: { stream: false, explain: false },
      },
      system: SYSTEM_PROMPT,
      user: msg.text,
      stream: false,
      cancel: cancelSrc.token,
      config: msg.cfg,
      onChunk: (c) => {
        if (c.type === 'delta') {
          firstDeltaAt ??= performance.now();
          accumulated += c.text;
        } else if (c.type === 'error') {
          errMsg = `${errCodeLabel(c.code)}: ${c.message}`;
        }
      },
    });
  } catch (e) {
    errMsg = (e as Error).message;
  } finally {
    release();
  }
  const totalMs = Math.round(performance.now() - start);
  const firstDeltaMs = firstDeltaAt === undefined ? undefined : Math.round(firstDeltaAt - start);
  if (errMsg !== null) {
    sendResponse({
      ok: false,
      error: errMsg,
      totalMs,
      ...(firstDeltaMs !== undefined ? { firstDeltaMs } : {}),
    });
    return;
  }
  sendResponse({
    ok: true,
    result: accumulated,
    totalMs,
    ...(firstDeltaMs !== undefined ? { firstDeltaMs } : {}),
  });
}
