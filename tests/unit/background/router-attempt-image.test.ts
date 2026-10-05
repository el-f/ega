import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { runTranslateAttempt, type AttemptDeps } from '@/background/router-attempt';
import { IMAGE_TIMED_OUT } from '@/background/router-chunks';
import { createTranslateFsm } from '@/background/router-fsm';
import { createCancelToken } from '@/shared/cancel-token';
import { buildBackendConfig } from '@/shared/backends/build-config';
import type { TranslateImageArgs, TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk, TranslationRequest } from '@/shared/types';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { testManifest } from '@tests/_helpers/backend';

const IMAGE = { imageBase64: 'AAAA', mediaType: 'image/png' };

function req(explain: boolean): TranslationRequest {
  return {
    id: 'r1',
    text: '',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    options: { stream: false, explain, imageUrl: 'https://example.com/a.png' },
  };
}

function vision(
  translateImage: ((a: TranslateImageArgs) => Promise<void>) | undefined,
): TranslationBackend & { translate: Mock } {
  return {
    id: asBackendIdUnsafe('anthropic'),
    manifest: testManifest('anthropic', translateImage !== undefined),
    isAvailable: async () => true,
    translate: vi.fn(async () => {}),
    ...(translateImage ? { translateImage } : {}),
  };
}

function deps(
  backend: TranslationBackend,
  over: Partial<AttemptDeps> = {},
): AttemptDeps & { chunks: TranslationChunk[] } {
  const chunks: TranslationChunk[] = [];
  const fsm = createTranslateFsm();
  fsm.send({ type: 'start' });
  const r = req(false);
  return {
    backend,
    isLast: true,
    reqView: r,
    reqOptions: r.options,
    streaming: true,
    cfg: buildBackendConfig(DEFAULT_SETTINGS),
    system: 'SYS',
    user: 'USR',
    image: IMAGE,
    cancel: createCancelToken().token,
    fsm,
    attemptLog: [],
    reqId: 'r1',
    onChunk: (c) => chunks.push(c),
    attachMeta: (c) => c,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    chunks,
    ...over,
  };
}

describe('runTranslateAttempt — vision attempt', () => {
  it('runs translateImage on the fetched image with the built prompts, never translate', async () => {
    const seen: TranslateImageArgs[] = [];
    const b = vision(async (a) => {
      seen.push(a);
      a.onChunk({ type: 'delta', requestId: a.requestId, text: '{"translation":"x"}' });
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const d = deps(b);

    const outcome = await runTranslateAttempt(d);

    expect(outcome).toEqual({ kind: 'completed' });
    expect(b.translate).not.toHaveBeenCalled();
    expect(seen[0]).toMatchObject({ ...IMAGE, system: 'SYS', user: 'USR', requestId: 'r1' });
    expect(d.chunks.map((c) => c.type)).toEqual(['delta', 'done']);
  });

  it('stamps usedImage on the done chunk only when the request asked for an explain', async () => {
    const answer = vision(async (a) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const ocr = deps(answer);
    await runTranslateAttempt(ocr);
    expect(ocr.chunks[0]).not.toHaveProperty('usedImage');

    const explain = deps(answer, { reqView: req(true), reqOptions: req(true).options });
    await runTranslateAttempt(explain);
    expect(explain.chunks[0]).toMatchObject({ type: 'done', usedImage: true });
  });

  it('a backend with no translateImage ends in one UNKNOWN terminal instead of translating the text', async () => {
    const b = vision(undefined);
    const d = deps(b);

    const outcome = await runTranslateAttempt(d);

    expect(outcome).toEqual({ kind: 'final_error_emitted' });
    expect(b.translate).not.toHaveBeenCalled();
    expect(d.chunks).toEqual([
      {
        type: 'error',
        requestId: 'r1',
        code: 'UNKNOWN',
        message: 'anthropic cannot read images',
        backendId: 'anthropic',
      },
    ]);
  });

  it('rewrites ABORTED after the wall clock with the wording the router hands it', async () => {
    const { token, cancel } = createCancelToken();
    const b = vision(async (a) => {
      cancel('wallclock');
      a.onChunk({ type: 'error', requestId: a.requestId, code: 'ABORTED', message: 'aborted' });
    });
    const d = deps(b, { cancel: token, timedOutMessage: IMAGE_TIMED_OUT });

    await runTranslateAttempt(d);

    expect(d.chunks).toEqual([
      {
        type: 'error',
        requestId: 'r1',
        code: 'TIMEOUT',
        message: IMAGE_TIMED_OUT,
        backendId: 'anthropic',
      },
    ]);
  });
});
