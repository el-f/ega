import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslateImageArgs, TranslationBackend } from '@/shared/backends/base';
import type { Settings, TranslationChunk, TranslationRequest } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { readAuditLog, clearAuditLog } from '@/shared/audit-log';
import type { Rule } from '@/shared/rules';
import { clearPerfBuffer, getPerfEntries } from '@/shared/perf-history';
import { resetChromeMock } from '../mocks/chrome';
import { testManifest } from '@tests/_helpers/backend';
import { flushAudit } from '@tests/_helpers/async';
import { baseDeps, mkSettings } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);
const IMAGE_URL = 'https://example.com/pic.png';

type ImageImpl = (a: TranslateImageArgs) => Promise<void>;

function vision(id: string, impl: ImageImpl): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, true),
    isAvailable: async () => true,
    translate: async () => {},
    translateImage: impl,
  };
}

const answer: ImageImpl = async (a) => {
  a.onChunk({ type: 'delta', requestId: a.requestId, text: '{"translation":"OCR"}' });
  a.onChunk({ type: 'done', requestId: a.requestId, confidence: 0.7 });
};

function settings(patch: Partial<Settings> = {}): Settings {
  return mkSettings({
    openaiApiKey: 'k',
    backendOrder: [bid('anthropic'), bid('openai')],
    ...patch,
  });
}

function deps(backends: TranslationBackend[], patch: Partial<RouterDeps> = {}): RouterDeps {
  return baseDeps({ backends, getSettings: async () => settings(), ...patch });
}

function imageReq(over: Partial<TranslationRequest> = {}): TranslationRequest {
  return {
    id: 'img-1',
    text: '[image]',
    sourceLang: 'auto',
    targetLang: asLangIdUnsafe('en'),
    options: { stream: true, explain: false, imageUrl: IMAGE_URL },
    ...over,
  };
}

beforeEach(async () => {
  resetChromeMock();
  clearPerfBuffer();
  await clearAuditLog();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('the image request runs the text path', () => {
  it('the refinement and the pinned source variety reach the image explain through the one prompt path', async () => {
    const seen: TranslateImageArgs[] = [];
    const router = createRouter(
      deps([
        vision('anthropic', async (a) => {
          seen.push(a);
          await answer(a);
        }),
      ]),
    );

    await router.handleTranslate(
      imageReq({
        text: 'ya salam',
        sourceLang: asLangIdUnsafe('ar'),
        options: {
          stream: true,
          explain: true,
          imageUrl: IMAGE_URL,
          refinement: 'focus on the slang',
        },
      }),
      () => {},
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.user).toContain('Refinement for this response: focus on the slang');
    expect(seen[0]?.user).toContain('ya salam');
    expect(seen[0]?.system).toContain('<role>You are a cultural-subtext analyst');
  });

  it('the done chunk carries the same result meta a text answer gets', async () => {
    const router = createRouter(deps([vision('anthropic', answer)]));
    const chunks: TranslationChunk[] = [];

    await router.handleTranslate(imageReq(), (c) => chunks.push(c));

    const done = chunks.find((c) => c.type === 'done');
    expect(done?.type === 'done' ? done.meta : undefined).toMatchObject({
      backendId: 'anthropic',
      cacheHit: false,
      targetLang: 'en',
    });
  });

  it('a vision backend that throws rotates to the next one, like a text backend', async () => {
    const second = vi.fn<ImageImpl>(answer);
    const router = createRouter(
      deps([
        vision('anthropic', async () => {
          throw new Error('boom');
        }),
        vision('openai', second),
      ]),
    );
    const chunks: TranslationChunk[] = [];

    await router.handleImageTranslate({ id: 'img-throw', imageUrl: IMAGE_URL }, (c) =>
      chunks.push(c),
    );

    expect(second).toHaveBeenCalledOnce();
    expect(chunks.map((c) => c.type)).toEqual(['delta', 'done']);
  });

  it('a cancel during the download ends in one ABORTED terminal and an ABORTED audit row', async () => {
    const router = createRouter(deps([vision('anthropic', answer)]));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        router.cancel('img-cancel');
        throw init?.signal?.reason ?? new DOMException('aborted', 'AbortError');
      }),
    );
    const chunks: TranslationChunk[] = [];

    await router.handleImageTranslate({ id: 'img-cancel', imageUrl: IMAGE_URL }, (c) =>
      chunks.push(c),
    );
    await flushAudit();

    expect(chunks).toEqual([
      { type: 'error', requestId: 'img-cancel', code: 'ABORTED', message: 'cancelled' },
    ]);
    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.error?.code).toBe('ABORTED');
  });

  it('an image the download rejects is audited but never charged to a backend that never ran', async () => {
    const router = createRouter(deps([vision('anthropic', answer)]));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new TextEncoder().encode('<html>nope</html>'), {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    );
    const chunks: TranslationChunk[] = [];

    await router.handleImageTranslate({ id: 'img-badtype', imageUrl: IMAGE_URL }, (c) =>
      chunks.push(c),
    );
    await flushAudit();

    expect(chunks[0]?.type).toBe('error');
    const log = await readAuditLog();
    expect(log[0]?.error?.code).toBe('IMAGE_UNSUPPORTED');
    expect(log[0]?.backend).toBe('unknown');
    expect(getPerfEntries()).toEqual([]);
  });

  it('the tooltip explain-with-image runs as the explain task: explain rules apply and the audit row says explain', async () => {
    const rule: Rule = {
      id: 'r-explain',
      body: 'answer in bullet points',
      category: 'always',
      scope: { tasks: ['explain'] },
      source: 'manual',
      addedAt: '2026-01-01',
      enabled: true,
    };
    const seen: TranslateImageArgs[] = [];
    const router = createRouter(
      deps(
        [
          vision('anthropic', async (a) => {
            seen.push(a);
            await answer(a);
          }),
        ],
        {
          getSettings: async () =>
            settings({ advanced: { ...DEFAULT_SETTINGS.advanced, rules: [rule] } }),
        },
      ),
    );

    // The tooltip sends explain as a flag and never names the task.
    await router.handleTranslate(
      imageReq({
        id: 'img-tip-explain',
        options: { stream: false, explain: true, imageUrl: IMAGE_URL },
      }),
      () => {},
    );
    await flushAudit();

    expect(seen[0]?.system).toContain('answer in bullet points');
    const log = await readAuditLog();
    expect(log[0]?.task).toBe('explain');
  });

  it('two image requests with the same placeholder text both run — images never share the in-flight key', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const impl = vi.fn<ImageImpl>(async (a) => {
      await gate;
      await answer(a);
    });
    const router = createRouter(
      deps([vision('anthropic', impl)], {
        getSettings: async () => settings({ cacheEnabled: true }),
      }),
    );

    const a = router.handleTranslate(imageReq({ id: 'img-a' }), () => {});
    const b = router.handleTranslate(
      imageReq({
        id: 'img-b',
        options: { stream: true, explain: false, imageUrl: 'https://example.com/other.png' },
      }),
      () => {},
    );
    await vi.waitFor(() => expect(impl).toHaveBeenCalledTimes(2));
    release();
    await Promise.all([a, b]);
  });
});

describe('the request a context-menu image click turns into', () => {
  function router(patch: Partial<Settings> = {}) {
    const seen: TranslateImageArgs[] = [];
    const r = createRouter(
      deps(
        [
          vision('anthropic', async (a) => {
            seen.push(a);
            await answer(a);
          }),
        ],
        { getSettings: async () => settings(patch) },
      ),
    );
    return { seen, r };
  }

  it('takes the caller target language over the stored default', async () => {
    const { r } = router({ defaultTargetLang: asLangIdUnsafe('fr') });

    await r.handleImageTranslate({ id: 'i1', imageUrl: IMAGE_URL, targetLang: 'de' }, () => {});
    await flushAudit();

    expect((await readAuditLog())[0]?.targetLang).toBe('de');
  });

  it('falls back to the stored default when the caller names none', async () => {
    const { r } = router({ defaultTargetLang: asLangIdUnsafe('fr') });

    await r.handleImageTranslate({ id: 'i2', imageUrl: IMAGE_URL }, () => {});
    await flushAudit();

    expect((await readAuditLog())[0]?.targetLang).toBe('fr');
  });

  it('names the explain task on explain, and translate otherwise', async () => {
    const t = router();
    await t.r.handleImageTranslate({ id: 'i4', imageUrl: IMAGE_URL }, () => {});
    await flushAudit();
    expect((await readAuditLog())[0]?.task).toBe('translate');

    await clearAuditLog();
    const e = router();
    await e.r.handleImageExplain({ id: 'i5', imageUrl: IMAGE_URL }, () => {});
    await flushAudit();
    expect((await readAuditLog())[0]?.task).toBe('explain');
  });

  it('always detects the source language rather than assuming one', async () => {
    const { r } = router();

    await r.handleImageTranslate({ id: 'i8', imageUrl: IMAGE_URL }, () => {});
    await flushAudit();

    expect((await readAuditLog())[0]?.sourceLang).toBe('auto');
  });

  it('builds the OCR prompt for the resolved target, not the stored one', async () => {
    const { seen, r } = router({ defaultTargetLang: asLangIdUnsafe('fr') });

    await r.handleImageTranslate({ id: 'i9', imageUrl: IMAGE_URL, targetLang: 'de' }, () => {});

    const prompt = `${seen[0]?.system ?? ''} ${seen[0]?.user ?? ''}`;
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).not.toContain('French');
  });
});
