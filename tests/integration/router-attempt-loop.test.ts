import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter } from '@/background/router';
import { TRANSLATE_TIMED_OUT } from '@/background/router-chunks';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';
import type { ChatTurn } from '@/shared/chat-history';
import type * as AuditLog from '@/shared/audit-log';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps, mkSettings } from '@tests/_helpers/router';

const { auditSpy } = vi.hoisted(() => ({
  auditSpy: vi.fn<(entry: unknown) => Promise<void>>(async () => {}),
}));

// usedBackendId and the synthesized fsm error reach nothing but the audit entry.
vi.mock('@/shared/audit-log', async (importOriginal) => ({
  ...(await importOriginal<typeof AuditLog>()),
  pushAuditEntry: auditSpy,
}));

const bid = (s: string) => asBackendIdUnsafe(s);

interface AuditArgs {
  backend: string;
  response: string;
  task?: string;
  batch?: boolean;
  error?: { code: string; message: string };
}

function lastAudit(): AuditArgs {
  return auditSpy.mock.calls.at(-1)?.[0] as AuditArgs;
}

function mkBackend(opts: {
  id: string;
  translate?: (a: TranslateCallArgs) => Promise<void>;
}): TranslationBackend {
  return {
    id: bid(opts.id),
    manifest: testManifest(opts.id),
    isAvailable: async () => true,
    translate:
      opts.translate ??
      (async ({ req, onChunk }) => {
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"hola"}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      }),
  };
}

const REQ = {
  id: 'r1',
  text: 'hi',
  sourceLang: sel('arabizi'),
  targetLang: sel('en'),
  options: { stream: true, explain: false },
};

const TIMEOUT_CHUNK = {
  type: 'error',
  requestId: 'r1',
  code: 'TIMEOUT',
  message: TRANSLATE_TIMED_OUT,
};

// Ceiling is translateTimeoutMs + 30_000 and is registered before the wall-clock timer, so 0ms fires it first and the cancel reason stays 'user'.
const CEILING_FIRST_TIMEOUT_MS = -30_000;

describe('router — attempt loop terminal handling', () => {
  beforeEach(() => {
    auditSpy.mockClear();
  });

  it('forwards conversationHistory to the backend and omits the key when absent', async () => {
    const seen: TranslateCallArgs[] = [];
    const a = mkBackend({
      id: 'anthropic',
      translate: async (args) => {
        seen.push(args);
        args.onChunk({ type: 'done', requestId: args.req.id, confidence: 1 });
      },
    });
    const history: ChatTurn[] = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    const router = createRouter(baseDeps({ backends: [a] }));
    await router.handleTranslate(
      { ...REQ, options: { stream: true, explain: false, conversationHistory: history } },
      () => {},
    );
    await router.handleTranslate({ ...REQ, id: 'r2' }, () => {});
    expect(seen[0]?.history).toEqual(history);
    expect(seen.map((s) => 'history' in s)).toEqual([true, false]);
  });

  it('synthesizes exactly one TIMEOUT chunk on the wall-clock and audits it', async () => {
    const a = mkBackend({ id: 'anthropic', translate: () => new Promise<void>(() => {}) });
    const deps = baseDeps({ backends: [a], translateTimeoutMs: 20 });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(chunks).toEqual([TIMEOUT_CHUNK]);
    expect(lastAudit().error).toEqual({ code: 'TIMEOUT', message: TRANSLATE_TIMED_OUT });
  });

  it('does not synthesize TIMEOUT when the backend completes on the wall-clock abort', async () => {
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk, cancel }) => {
        await new Promise<void>((resolve) => {
          cancel.signal.addEventListener(
            'abort',
            () => {
              onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"late"}' });
              onChunk({ type: 'done', requestId: req.id, confidence: 0.9 });
              resolve();
            },
            { once: true },
          );
        });
      },
    });
    const deps = baseDeps({ backends: [a], translateTimeoutMs: 20 });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(chunks.filter((c) => c.type === 'error')).toEqual([]);
    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' ? done.confidence : null).toBe(0.9);
  });

  it('lifecycle-ceiling breach on an unfinished run emits TIMEOUT and audits it', async () => {
    const a = mkBackend({ id: 'anthropic', translate: () => new Promise<void>(() => {}) });
    const deps = baseDeps({ backends: [a], translateTimeoutMs: CEILING_FIRST_TIMEOUT_MS });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(chunks).toEqual([TIMEOUT_CHUNK]);
    expect(lastAudit().error).toEqual({ code: 'TIMEOUT', message: TRANSLATE_TIMED_OUT });
  });

  it('lifecycle-ceiling breach after a terminal error adds no second terminal', async () => {
    const a = mkBackend({
      id: 'anthropic',
      translate: ({ req, onChunk }) => {
        onChunk({ type: 'error', requestId: req.id, code: 'PARSE', message: 'bad json' });
        return new Promise<void>(() => {});
      },
    });
    const deps = baseDeps({ backends: [a], translateTimeoutMs: CEILING_FIRST_TIMEOUT_MS });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(chunks).toEqual([
      { type: 'error', requestId: 'r1', code: 'PARSE', message: 'bad json' },
    ]);
  });

  it('lifecycle-ceiling breach after the backend completed emits nothing extra', async () => {
    const a = mkBackend({
      id: 'anthropic',
      translate: ({ req, onChunk }) => {
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"early"}' });
        onChunk({ type: 'done', requestId: req.id, confidence: 0.7 });
        return new Promise<void>(() => {});
      },
    });
    const deps = baseDeps({ backends: [a], translateTimeoutMs: CEILING_FIRST_TIMEOUT_MS });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(chunks.filter((c) => c.type === 'error')).toEqual([]);
    expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
    expect(lastAudit().response).toBe('early');
  });

  it('a non-ceiling failure escaping the lifecycle is logged, not swallowed', async () => {
    const a = mkBackend({ id: 'anthropic', translate: () => new Promise<void>(() => {}) });
    const error = vi.fn();
    const deps = baseDeps({
      backends: [a],
      translateTimeoutMs: 20,
      logger: { debug() {}, info() {}, warn() {}, error },
    });
    const chunks: TranslationChunk[] = [];
    let exploded = false;
    const onChunk = (c: TranslationChunk): void => {
      chunks.push(c);
      // The wall-clock synthesis is the one onChunk call outside a try, so a throw here rejects the lifecycle with a plain Error.
      if (!exploded) {
        exploded = true;
        throw new Error('sink exploded');
      }
    };
    await createRouter(deps).handleTranslate(REQ, onChunk);
    expect(error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({}));
    expect(String(error.mock.calls.at(-1)?.[1])).toContain('sink exploded');
    expect(chunks).toHaveLength(1);
  });

  it('audits the backend that actually answered, not the first one tried', async () => {
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'error', requestId: req.id, code: 'RATE_LIMIT', message: '429' });
      },
    });
    const b = mkBackend({ id: 'openai' });
    const deps = baseDeps({
      backends: [a, b],
      getSettings: async () => mkSettings({ openaiApiKey: 'k' }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
    expect(lastAudit().backend).toBe('openai');
  });

  it('persists detectedLang, detectedDetail and explain with the translation', async () => {
    const setSpy = vi.fn<(k: string, v: unknown) => Promise<void>>(async () => {});
    const a = mkBackend({
      id: 'anthropic',
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"hola"}' });
        onChunk({
          type: 'done',
          requestId: req.id,
          confidence: 0.8,
          detectedLang: 'es',
          detectedDetail: 'Rioplatense',
          explain: 'note',
        });
      },
    });
    const deps = baseDeps({
      backends: [a],
      cache: { get: async () => undefined, set: setSpy },
    });
    await createRouter(deps).handleTranslate(REQ, () => {});
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0]?.[1]).toEqual({
      translation: 'hola',
      confidence: 0.8,
      detectedLang: 'es',
      detectedDetail: 'Rioplatense',
      explain: 'note',
    });
  });

  it('a failing cache write is caught and logged with its exact warning', async () => {
    const warnSpy = vi.fn();
    const a = mkBackend({ id: 'anthropic' });
    const deps = baseDeps({
      backends: [a],
      cache: {
        get: async () => undefined,
        set: async () => {
          throw new Error('quota exceeded');
        },
      },
      logger: { debug() {}, info() {}, warn: warnSpy, error() {} },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleTranslate(REQ, (c) => chunks.push(c));
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('post-flight persist failed', expect.any(Error));
  });

  describe('the task a request did not name', () => {
    async function auditedTask(options: Record<string, unknown>): Promise<string | undefined> {
      const deps = baseDeps({ backends: [mkBackend({ id: 'anthropic' })] });
      await createRouter(deps).handleTranslate(
        { ...REQ, options: { stream: false, ...options } } as typeof REQ,
        () => {},
      );
      return lastAudit().task;
    }

    it('reads explain:true as the explain task', async () => {
      expect(await auditedTask({ explain: true })).toBe('explain');
    });

    it('reads a carried image with no explain as the OCR arm of translate', async () => {
      expect(await auditedTask({ explain: false, imageUrl: 'https://x/a.png' })).toBe('translate');
    });

    it('leaves a plain request on translate', async () => {
      expect(await auditedTask({ explain: false })).toBe('translate');
    });

    it('never overrides a task the caller named', async () => {
      expect(await auditedTask({ explain: true, task: 'reword' })).toBe('reword');
    });
  });

  describe('the batch flag on an audit row', () => {
    async function auditedBatch(batch?: boolean): Promise<boolean | undefined> {
      const deps = baseDeps({ backends: [mkBackend({ id: 'anthropic' })] });
      await createRouter(deps).handleTranslate(
        {
          ...REQ,
          options: { stream: false, explain: false, ...(batch !== undefined ? { batch } : {}) },
        } as typeof REQ,
        () => {},
      );
      return lastAudit().batch;
    }

    it('is set only when the caller asked for a batch', async () => {
      expect(await auditedBatch(true)).toBe(true);
      expect(await auditedBatch(false)).toBeUndefined();
      expect(await auditedBatch()).toBeUndefined();
    });
  });
});
