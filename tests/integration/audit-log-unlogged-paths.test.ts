import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import { buildBackendConfig as settingsToConfig } from '@/shared/backends/build-config';
import type { TranslationBackend } from '@/shared/backends/base';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import {
  readAuditLog,
  clearAuditLog,
  clampField,
  AUDIT_MAX_PROMPT_CHARS,
} from '@/shared/audit-log';
import { resetChromeMock } from '../mocks/chrome';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import type * as RegistryModule from '@/shared/backends/registry';
import { flushAudit } from '@tests/_helpers/async';

const bid = (s: string) => asBackendIdUnsafe(s);

// describeChange resolves its chain from the real registry, not from an argument.
let registryBackend: TranslationBackend | null = null;
vi.mock('@/shared/backends/registry', async () => {
  const actual = await vi.importActual<typeof RegistryModule>('@/shared/backends/registry');
  return {
    ...actual,
    getRegisteredBackendIds: () => [asBackendIdUnsafe('anthropic')],
    resolveBackend: (id: string) =>
      id === 'anthropic' ? registryBackend : actual.resolveBackend(id),
  };
});

const { describeChange } = await import('@/background/describe-change');

let origFetch: typeof globalThis.fetch;

beforeEach(async () => {
  resetChromeMock();
  await clearAuditLog();
  registryBackend = null;
  origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

function visionBackend(
  id: string,
  behaviour: 'ok' | 'error' = 'ok',
  capture?: { system: string[]; user: string[] },
): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, true),
    isAvailable: async () => true,
    translate: async ({ req, system, user, onChunk }) => {
      capture?.system.push(system);
      capture?.user.push(user);
      onChunk({
        type: 'delta',
        requestId: req.id,
        text: JSON.stringify({
          category: 'always',
          body: 'Keep it short.',
          scope: { tasks: ['translate'] },
        }),
      });
      onChunk({ type: 'done', requestId: req.id, confidence: 1 });
    },
    translateImage: async ({ requestId, system, user, onChunk }) => {
      capture?.system.push(system ?? '');
      capture?.user.push(user ?? '');
      if (behaviour === 'error') {
        onChunk({ type: 'error', requestId, code: 'AUTH', message: 'bad key' });
        return;
      }
      onChunk({
        type: 'delta',
        requestId,
        text: JSON.stringify({ translation: 'a sign that reads OPEN', confidence: 0.8 }),
      });
      onChunk({ type: 'done', requestId, confidence: 0.8 });
    },
  };
}

function settings(): typeof DEFAULT_SETTINGS {
  return {
    ...DEFAULT_SETTINGS,
    backendOrder: [bid('anthropic')],
    disabledBackends: [],
    anthropicApiKey: 'k',
  };
}

function routerWith(backend: TranslationBackend): ReturnType<typeof createRouter> {
  const deps: RouterDeps = {
    backends: [backend],
    getSettings: async () => settings(),
    cache: { get: async () => undefined, set: async () => {} },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };
  return createRouter(deps);
}

describe('audit log covers the image paths', () => {
  it('handleImageTranslate writes one entry with the OCR prompt and the result', async () => {
    const router = routerWith(visionBackend('anthropic'));
    await router.handleImageTranslate(
      { id: 'img-audit-ok', imageUrl: 'https://example.com/sign.png' },
      () => {},
    );
    await flushAudit();

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    const entry = log[0];
    if (!entry) throw new Error('audit entry missing');
    expect(entry.task).toBe('translate');
    expect(entry.backend).toBe('anthropic');
    expect(entry.requestId).toBe('img-audit-ok');
    expect(entry.cacheHit).toBe(false);
    expect(entry.error).toBeUndefined();
    expect(entry.response).toBe('a sign that reads OPEN');
    expect(entry.confidence).toBe(0.8);
    expect(entry.systemPrompt.length).toBeGreaterThan(0);
    expect(entry.userPrompt.length).toBeGreaterThan(0);
  });

  it('handleImageExplain writes an entry tagged with the explain task', async () => {
    const router = routerWith(visionBackend('anthropic'));
    await router.handleImageExplain(
      {
        id: 'img-audit-explain',
        imageUrl: 'https://example.com/post.png',
        text: 'ya salam',
        targetLang: 'en',
      },
      () => {},
    );
    await flushAudit();

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.task).toBe('explain');
    expect(log[0]?.requestId).toBe('img-audit-explain');
    expect(log[0]?.response).toBe('a sign that reads OPEN');
  });

  it('a failing image request is audited with its error code', async () => {
    const router = routerWith(visionBackend('anthropic', 'error'));
    await router.handleImageTranslate(
      { id: 'img-audit-err', imageUrl: 'https://example.com/sign.png' },
      () => {},
    );
    await flushAudit();

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.error?.code).toBe('AUTH');
    expect(log[0]?.response).toBe('');
  });

  it('a request with no vision backend is audited as UNSUPPORTED', async () => {
    const textOnly: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async () => {},
    };
    const router = routerWith(textOnly);
    await router.handleImageTranslate(
      { id: 'img-audit-unsupported', imageUrl: 'https://example.com/sign.png' },
      () => {},
    );
    await flushAudit();

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.error?.code).toBe('UNSUPPORTED');
  });

  it('records the exact prompt the vision backend received, clamped', async () => {
    const capture = { system: [] as string[], user: [] as string[] };
    const router = routerWith(visionBackend('anthropic', 'ok', capture));
    await router.handleImageTranslate(
      { id: 'img-audit-prompt', imageUrl: 'https://example.com/sign.png' },
      () => {},
    );
    await flushAudit();

    const entry = (await readAuditLog())[0];
    if (!entry) throw new Error('audit entry missing');
    const sentSystem = capture.system[0];
    const sentUser = capture.user[0];
    if (sentSystem === undefined || sentUser === undefined) {
      throw new Error('backend never received a prompt');
    }
    expect(sentSystem.length).toBeGreaterThan(0);
    expect(entry.systemPrompt).toBe(clampField(sentSystem, AUDIT_MAX_PROMPT_CHARS));
    expect(entry.userPrompt).toBe(clampField(sentUser, AUDIT_MAX_PROMPT_CHARS));
  });
});

describe('audit log covers describe-change', () => {
  it('writes an entry for the meta-prompt request', async () => {
    registryBackend = visionBackend('anthropic');
    const s = settings();
    await describeChange(
      'make it shorter',
      { task: 'translate' },
      { settings: s, config: settingsToConfig(s), timeoutMs: 5_000 },
    );
    await flushAudit();

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    const entry = log[0];
    if (!entry) throw new Error('audit entry missing');
    expect(entry.task).toBe('describe-change');
    expect(entry.backend).toBe('anthropic');
    expect(entry.systemPrompt.length).toBeGreaterThan(0);
    expect(entry.userPrompt).toContain('make it shorter');
  });

  it('writes nothing when the backend never accepts the call', async () => {
    registryBackend = { ...visionBackend('anthropic'), isAvailable: async () => false };
    const s = settings();
    await describeChange(
      'make it shorter',
      { task: 'translate' },
      { settings: s, config: settingsToConfig(s), timeoutMs: 5_000 },
    );
    await flushAudit();
    expect(await readAuditLog()).toHaveLength(0);
  });
});
