import { chromium, type BrowserContext, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import * as v from 'valibot';
import { parseSettingsPatch } from '../../src/shared/settings-schema';
import { CLOUD_PROVIDER_IDS } from '../../src/shared/provider-ids';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const ALL_BACKEND_IDS = [...CLOUD_PROVIDER_IDS, 'ollama', 'localserver', 'native'] as const;
type E2eBackendId = (typeof ALL_BACKEND_IDS)[number];

/** Seed fragment that enables exactly `active`, in that order, and disables every other registered backend. */
export function onlyBackends(...active: E2eBackendId[]): {
  backendOrder: E2eBackendId[];
  disabledBackends: E2eBackendId[];
} {
  const rest = ALL_BACKEND_IDS.filter((id) => !active.includes(id));
  return { backendOrder: [...active, ...rest], disabledBackends: rest };
}

export interface ExtensionHandle {
  context: BrowserContext;
  extensionId: string;
  serverUrl: string;
  userDataDir: string;
  close: () => Promise<void>;
}

/** MV3 installs only under `--load-extension` with a persistent profile, and a fresh profile denies file:// — so fixtures go over HTTP. */
export async function launchExtension(
  display: { deviceScaleFactor?: number; colorScheme?: 'light' | 'dark' } = {},
): Promise<ExtensionHandle> {
  if (!fs.existsSync(path.join(DIST_DIR, 'manifest.json'))) {
    throw new Error(
      `[e2e] dist/manifest.json missing — run pnpm build (or set EGA_E2E_SKIP_BUILD=0) first.`,
    );
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ega-e2e-'));
  const server = await startFixtureServer();

  // Chromium takes both separators; forward slashes dodge the Windows 260-char path limit.
  const extPath = DIST_DIR.replace(/\\/g, '/');
  const headed = process.env['EGA_E2E_HEADED'] === '1';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: !headed,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      // Guards against a Chrome milestone that turns off --load-extension.
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
    ],
    viewport: { width: 1200, height: 800 },
    ...display,
  });

  const extensionId = await resolveExtensionId(context);
  await closeFirstRunOptionsTab(context, extensionId);

  // Without this the first `translate:start` drops — the SW has not registered onMessage yet.
  await waitForServiceWorker(context, extensionId);
  await blockNativeHost(context);
  await blockExternalHosts(context);
  await blockLocalServers(context);

  // The onInstalled first-run options tab makes openOptionsPage() focus it instead of creating the fresh page specs wait for.
  for (const p of context.pages()) {
    if (p.url().includes('/src/options/')) await p.close();
  }

  const close = async (): Promise<void> => {
    try {
      await context.close();
    } catch {
      /* already closed */
    }
    await new Promise<void>((r) => server.close(() => r()));
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };

  return {
    context,
    extensionId,
    serverUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    userDataDir,
    close,
  };
}

/** onInstalled opens Settings on a fresh profile. If that lands while the probe page loads the same URL, Chrome reuses the probe tab, its goto is interrupted and its close() never returns. */
async function closeFirstRunOptionsTab(
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  const prefix = `chrome-extension://${extensionId}/src/options/`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const tab = context.pages().find((p) => p.url().startsWith(prefix));
    if (tab) {
      await tab.waitForLoadState('domcontentloaded').catch(() => undefined);
      await tab.close();
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function resolveExtensionId(context: BrowserContext): Promise<string> {
  const fromTargets = (): string | null => {
    const sw = context.serviceWorkers();
    for (const w of sw) {
      const m = w.url().match(/^chrome-extension:\/\/([a-z]+)\//i);
      if (m?.[1]) return m[1];
    }
    return null;
  };

  const immediate = fromTargets();
  if (immediate) return immediate;

  const sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  const m = sw.url().match(/^chrome-extension:\/\/([a-z]+)\//i);
  if (!m?.[1]) {
    throw new Error(`[e2e] could not extract extension id from SW url: ${sw.url()}`);
  }
  return m[1];
}

function startFixtureServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let rel = url.pathname.replace(/^\/+/, '');
      if (rel === '' || rel === 'index.html') rel = 'selection-page.html';
      // Traversal guard — resolve inside FIXTURES_DIR only.
      const abs = path.resolve(FIXTURES_DIR, rel);
      if (!abs.startsWith(FIXTURES_DIR)) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
      }
      fs.readFile(abs, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end(`not found: ${rel}`);
          return;
        }
        const ext = path.extname(abs).toLowerCase();
        const type =
          ext === '.html'
            ? 'text/html; charset=utf-8'
            : ext === '.js'
              ? 'application/javascript'
              : ext === '.css'
                ? 'text/css'
                : ext === '.png'
                  ? 'image/png'
                  : 'application/octet-stream';
        res.setHeader('Content-Type', type);
        res.end(data);
      });
    });
    const listen = (): void => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        // Chrome answers ERR_UNSAFE_PORT on these, and an ephemeral port lands on one now and then.
        if (CHROME_BLOCKED_PORTS.has(port)) {
          server.close(() => listen());
          return;
        }
        resolve(server);
      });
    };
    listen();
  });
}

// net/base/port_util.cc kRestrictedPorts, only the entries an ephemeral port can reach.
const CHROME_BLOCKED_PORTS = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

type DetectedLangs = ReadonlyArray<{ id: string; detail?: string }>;

/** What a mock model answers: the JSON the prompt asks for. Optional fields stay out unless set, so the body keeps the `{translation, confidence}` shape. */
interface MockAnswer {
  translation?: string;
  confidence?: number;
  explain?: string;
  /** Preset id or ISO code the model "detected". */
  detectedLang?: string;
  detectedDetail?: string;
  detectedLangs?: DetectedLangs;
}

/** Token counts every mock reports, as each real wire does, so the inspector has usage to show. */
export const MOCK_USAGE = { input: 42, output: 9 } as const;

function answerJson(opts: MockAnswer, defaultConfidence: number): string {
  return JSON.stringify({
    translation: opts.translation ?? 'Welcome, how are you?',
    confidence: opts.confidence ?? defaultConfidence,
    ...(opts.explain !== undefined ? { explain: opts.explain } : {}),
    ...(opts.detectedLang !== undefined ? { detectedLang: opts.detectedLang } : {}),
    ...(opts.detectedDetail !== undefined ? { detectedDetail: opts.detectedDetail } : {}),
    ...(opts.detectedLangs !== undefined ? { detectedLangs: opts.detectedLangs } : {}),
  });
}

/** Splits the JSON in two, so the content script's partial-JSON recovery path runs. */
function halves(json: string): [string, string] {
  const mid = Math.max(1, Math.floor(json.length / 2));
  return [json.slice(0, mid), json.slice(mid)];
}

/** Answer Anthropic messages calls with a canned reply (SSE, or a JSON message for `stream: false`); returns a counter of route hits. */
export function mockAnthropic(
  context: BrowserContext,
  opts: MockAnswer & { delayMs?: number; times?: number } = {},
): { calls: () => number; reset: () => void; lastRequestBody: () => string | null } {
  let calls = 0;
  let lastBody: string | null = null;
  const answer = answerJson(opts, 0.93);
  const sseBody = buildSseBody(answer);
  const jsonBody = JSON.stringify({
    id: 'm1',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: answer }],
    stop_reason: 'end_turn',
    usage: { input_tokens: MOCK_USAGE.input, output_tokens: MOCK_USAGE.output },
  });

  void context.route(
    'https://api.anthropic.com/v1/messages',
    async (route) => {
      calls += 1;
      try {
        lastBody = route.request().postData();
      } catch {
        lastBody = null;
      }
      let streamed = true;
      try {
        streamed = (JSON.parse(lastBody ?? '{}') as { stream?: unknown }).stream !== false;
      } catch {
        // A body that is not JSON keeps the streamed reply.
      }
      if (opts.delayMs) {
        await new Promise((r) => setTimeout(r, opts.delayMs));
      }
      try {
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': streamed ? 'text/event-stream' : 'application/json',
            'cache-control': 'no-cache',
            'access-control-allow-origin': '*',
          },
          body: streamed ? sseBody : jsonBody,
        });
      } catch {
        // After `unrouteAll` the replacement mock already answered this route, so fulfill throws.
      }
    },
    // `times: 1` drops the handler after one request, so sequential turns can register different mocks.
    opts.times !== undefined ? { times: opts.times } : undefined,
  );

  return {
    calls: () => calls,
    reset: () => {
      calls = 0;
      lastBody = null;
    },
    lastRequestBody: () => lastBody,
  };
}

/** OpenAI-wire SSE mock for any `chat/completions` provider; pass the profile's `baseUrl`. */
export function mockOpenAICompat(
  context: BrowserContext,
  url: string,
  opts: MockAnswer = {},
): { calls: () => number; reset: () => void } {
  let calls = 0;
  const body = buildOpenAiSseBody(answerJson(opts, 0.9));
  void context.route(url, async (route) => {
    calls += 1;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
      body,
    });
  });
  return {
    calls: () => calls,
    reset: () => {
      calls = 0;
    },
  };
}

export const mockOpenAI = (
  context: BrowserContext,
  opts: MockAnswer = {},
): { calls: () => number; reset: () => void } =>
  mockOpenAICompat(context, 'https://api.openai.com/v1/chat/completions', opts);

/** Gemini SSE mock — `candidates[0].content.parts[0].text` envelope; a pattern route skips the model + key in the URL. */
export function mockGemini(
  context: BrowserContext,
  opts: MockAnswer = {},
): { calls: () => number; reset: () => void } {
  let calls = 0;
  const body = buildGeminiSseBody(answerJson(opts, 0.9));
  void context.route(
    /https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/.*:streamGenerateContent.*/,
    async (route) => {
      calls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        },
        body,
      });
    },
  );
  return {
    calls: () => calls,
    reset: () => {
      calls = 0;
    },
  };
}

/** Two deltas, a finish_reason frame, then the empty-choices `include_usage` frame, as the real stream sends them. */
function buildOpenAiSseBody(json: string): string {
  const [first, second] = halves(json);
  const frames = [
    { choices: [{ delta: { content: first } }] },
    { choices: [{ delta: { content: second } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
    {
      choices: [],
      usage: { prompt_tokens: MOCK_USAGE.input, completion_tokens: MOCK_USAGE.output },
    },
  ].map((f) => `data: ${JSON.stringify(f)}`);
  // Every frame needs the `\n\n` terminator, including `[DONE]`, or the SSE splitter drops it.
  return `${[...frames, 'data: [DONE]'].join('\n\n')}\n\n`;
}

function buildGeminiSseBody(json: string): string {
  const [first, second] = halves(json);
  const frame1 = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: first }] } }] })}`;
  const frame2 = `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text: second }] }, finishReason: 'STOP' }],
    usageMetadata: {
      promptTokenCount: MOCK_USAGE.input,
      candidatesTokenCount: MOCK_USAGE.output,
    },
  })}`;
  // The last frame needs the `\n\n` terminator too, or the SSE splitter drops it.
  return `${frame1}\n\n${frame2}\n\n`;
}

/** message_start carries the input usage, message_delta the output usage and the stop reason. */
function buildSseBody(json: string): string {
  const [first, second] = halves(json).map((h) => JSON.stringify(h));
  const lines = [
    `event: message_start`,
    `data: {"type":"message_start","message":{"id":"m1","type":"message","role":"assistant","content":[],"usage":{"input_tokens":${MOCK_USAGE.input},"output_tokens":1}}}`,
    ``,
    `event: content_block_start`,
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${first}}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${second}}}`,
    ``,
    `event: content_block_stop`,
    `data: {"type":"content_block_stop","index":0}`,
    ``,
    `event: message_delta`,
    `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":${MOCK_USAGE.output}}}`,
    ``,
    `event: message_stop`,
    `data: {"type":"message_stop"}`,
    ``,
  ];
  return lines.join('\n');
}

/** A click from `page.evaluate` carries a user gesture, so the real side panel opens and drains `ega.pendingPopupHandoff` before a spec can read it. */
export async function suppressSidePanelOpen(
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  const prefix = `chrome-extension://${extensionId}/`;
  const sw =
    context.serviceWorkers().find((w) => w.url().startsWith(prefix)) ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  await sw.evaluate(() => {
    chrome.sidePanel.open = (async () => {}) as unknown as typeof chrome.sidePanel.open;
  });
}

/** Make the native backend look uninstalled in every page — a machine with the host registered answers `connectNative` for real, which makes results and pixel baselines machine-specific. */
const BLOCK_NATIVE_HOST_SCRIPT = `
  chrome.runtime.connectNative = (() => {
    const port = {
      name: 'ega-e2e-blocked',
      onMessage: { addListener: () => {}, removeListener: () => {} },
      onDisconnect: {
        addListener: (fn) => { setTimeout(() => fn(port), 0); },
        removeListener: () => {},
      },
      postMessage: () => {},
      disconnect: () => {},
    };
    return port;
  });
`;

/** Refuse the default Ollama address: seedSettings replaces disabledBackends, so a partial list re-enables Ollama and a real local daemon takes the fallback. A spec's own later route still wins. */
// Ollama, LM Studio and llama-server defaults: a real local server would answer a fallback the spec meant to mock.
const LOCAL_SERVER_PORTS = [11434, 1234, 8080];

export async function blockLocalServers(context: BrowserContext): Promise<void> {
  for (const host of ['localhost', '127.0.0.1']) {
    for (const port of LOCAL_SERVER_PORTS) {
      await context.route(`http://${host}:${port}/**`, (route) => route.abort('connectionrefused'));
    }
  }
}

/** Any http(s) request off loopback that no mock answers is aborted, so a spec that forgot a mock fails instead of reaching a real API. Later routes run first, so a spec's own mock still wins. */
async function blockExternalHosts(context: BrowserContext): Promise<void> {
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, async (route) => {
    process.stderr.write(`[e2e] blocked an unmocked request: ${route.request().url()}\n`);
    await route.abort('blockedbyclient');
  });
}

/** Clears every route mock but keeps the local servers and external hosts blocked: `unrouteAll` alone lets a real daemon or API answer. */
export async function resetRoutes(
  context: BrowserContext,
  behavior: 'wait' | 'ignoreErrors' = 'ignoreErrors',
): Promise<void> {
  await context.unrouteAll({ behavior });
  await blockExternalHosts(context);
  await blockLocalServers(context);
}

/** Pages only: the e2e build blocks the SW itself, since a patch evaluated here dies with each SW restart. */
async function blockNativeHost(context: BrowserContext): Promise<void> {
  await context.addInitScript(`if (globalThis.chrome?.runtime) { ${BLOCK_NATIVE_HOST_SCRIPT} }`);
}

/** Merge a patch into `ega.settings` through an options-page tab — `chrome.storage.local` exists only inside extension contexts. */
export async function seedSettings(
  context: BrowserContext,
  extensionId: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  try {
    parseSettingsPatch(overrides);
  } catch (err) {
    const detail = v.isValiError(err) ? v.summarize(err.issues) : String(err);
    throw new Error(`[e2e] seedSettings: the patch does not match the settings schema\n${detail}`, {
      cause: err,
    });
  }
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await page.evaluate(async (patch) => {
      const key = 'ega.settings';
      const cur = await chrome.storage.local.get(key);
      const next = { ...(cur[key] as Record<string, unknown>), ...patch };
      await chrome.storage.local.set({ [key]: next });
    }, overrides);
  } finally {
    await page.close();
  }
  // Closing the last extension page lets Chrome evict the SW; re-probe so it is live before the next message.
  await waitForServiceWorker(context, extensionId);
}

/** Writes the custom task rows the Tasks tab would write. */
export async function seedCustomTasks(
  context: BrowserContext,
  extensionId: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await page.evaluate(async (r) => {
      await chrome.storage.local.set({ 'ega.customTasks': r });
    }, rows);
  } finally {
    await page.close();
  }
  await waitForServiceWorker(context, extensionId);
}

/** A custom task row with plain defaults; pass fields to override. */
export function customTask(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c-tweet',
    label: 'Tweet summary',
    system: 'Summarize the text as one short tweet.',
    user: '{{text}}',
    output: 'plain',
    pageContext: false,
    image: false,
    glossary: false,
    createdAt: 1,
    ...over,
  };
}

export interface ImageTranslateHandle {
  tabId: number;
  requestId: string;
  imageUrl: string;
}

/** `dispatchImageTranslate` always sends pending first, and the content script drops a result whose request never claimed the renderer. Send from an extension page: `chrome.tabs` is extension-only and `sender.tab` stays undefined there, which the content script's own-background guard requires. */
export async function sendImageTranslatePending(
  extensionPage: Page,
  tabUrlPrefix: string,
  imageUrl: string,
): Promise<ImageTranslateHandle> {
  const handle = await extensionPage.evaluate(
    async ({ url, imgUrl }) => {
      const tabs = await chrome.tabs.query({ url: `${url}/*` });
      const target = tabs.find((t) => typeof t.id === 'number');
      if (!target?.id) return null;
      const requestId = crypto.randomUUID();
      await chrome.tabs.sendMessage(target.id, {
        kind: 'content:image-translate-pending',
        requestId,
        imageUrl: imgUrl,
      });
      return { tabId: target.id, requestId, imageUrl: imgUrl };
    },
    { url: tabUrlPrefix, imgUrl: imageUrl },
  );
  if (!handle)
    throw new Error(`[e2e] no open tab under ${tabUrlPrefix} to receive image-translate`);
  return handle;
}

/** Second half of the pair. Taking the handle is what keeps a spec from sending a result the content script will ignore. */
export async function sendImageTranslateResult(
  extensionPage: Page,
  handle: ImageTranslateHandle,
  result: {
    translation: string;
    confidence?: number;
    explain?: string;
    detectedLang?: string;
    detectedDetail?: string;
    usedImage?: boolean;
    task?: 'translate' | 'explain';
    error?: { code: string; message: string };
  },
): Promise<void> {
  await extensionPage.evaluate(
    async ({ h, r }) => {
      await chrome.tabs.sendMessage(h.tabId, {
        kind: 'content:image-translate-result',
        requestId: h.requestId,
        imageUrl: h.imageUrl,
        ...r,
      });
    },
    { h: handle, r: result },
  );
}

/** Read a storage key via an options-page tab. Returns the raw value or null. */
export async function readStorage<T = unknown>(
  context: BrowserContext,
  extensionId: string,
  key: string,
): Promise<T | null> {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    const value = await page.evaluate(async (k) => {
      const r = await chrome.storage.local.get(k);
      return r[k] ?? null;
    }, key);
    return value as T | null;
  } finally {
    await page.close();
  }
}

/** Select the arabizi paragraph, then fire `selectionchange` — the content script listens for that event. */
export async function selectArabiziParagraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('arabizi');
    if (!el) throw new Error('arabizi paragraph not present on fixture page');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) throw new Error('no window.getSelection()');
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
}

/** Bridge to the content script's isolated world, which `page.evaluate` cannot see: dispatch `ega:test:cmd`, read the answer off a `data-ega-test-<id>` attribute both worlds share. */
export async function egaTest<T = unknown>(
  page: Page,
  op: string,
  arg?: string,
): Promise<T | null> {
  const id = Math.random().toString(36).slice(2, 10);
  const result = await page.evaluate(
    ([id, op, arg]) => {
      return new Promise<unknown>((resolve) => {
        const attr = `data-ega-test-${id as string}`;
        document.documentElement.removeAttribute(attr);
        document.dispatchEvent(
          new CustomEvent('ega:test:cmd', {
            detail: { id, op, arg },
          }),
        );
        const start = performance.now();
        const tick = (): void => {
          const v = document.documentElement.getAttribute(attr);
          if (v !== null) {
            document.documentElement.removeAttribute(attr);
            try {
              const parsed = JSON.parse(v) as { ok: boolean; value: unknown };
              resolve(parsed.ok ? parsed.value : null);
            } catch {
              resolve(null);
            }
            return;
          }
          if (performance.now() - start > 2_000) {
            resolve(null);
            return;
          }
          setTimeout(tick, 25);
        };
        tick();
      });
    },
    [id, op, arg ?? null],
  );
  return result as T | null;
}

/** Wait for the test-hook bridge to be installed by the content script. */
export async function waitForTestHooks(page: Page, timeoutMs = 5_000): Promise<void> {
  await page.waitForSelector('html[data-ega-test-ready]', { timeout: timeoutMs });
}

/** Block until the SW's listeners are live — `launchPersistentContext` resolves before the worker registers, and a `translate:start` in that window is dropped. */
export async function waitForServiceWorker(
  context: BrowserContext,
  extensionId: string,
  timeoutMs = 15_000,
): Promise<void> {
  const prefix = `chrome-extension://${extensionId}/`;
  const sw =
    context.serviceWorkers().find((w) => w.url().startsWith(prefix)) ??
    (await context.waitForEvent('serviceworker', { timeout: timeoutMs }));
  // Phase 1: poll the readiness flag set at module-tail.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ready = await sw.evaluate(
        () => (self as unknown as { __egaReady?: boolean }).__egaReady === true,
      );
      if (ready) break;
    } catch {
      /* SW may be transiently unavailable mid-evaluation; retry */
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  if (Date.now() - start >= timeoutMs) {
    throw new Error(`[e2e] waitForServiceWorker: SW did not set __egaReady within ${timeoutMs}ms`);
  }
  // Phase 2: `__egaReady` can be set while a later SW restart tore the listener down — round-trip a probe.
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    const deadline = start + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            try {
              chrome.runtime.sendMessage({ kind: 'backend:probe' }, (r: unknown) => {
                const typed = r as { ok?: boolean } | undefined;
                resolve(Boolean(typed?.ok));
              });
            } catch {
              resolve(false);
            }
          }),
      );
      if (ok) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(
      `[e2e] waitForServiceWorker: backend:probe round-trip did not succeed within ${timeoutMs}ms`,
    );
  } finally {
    await page.close();
  }
}

/** Drive translate-areas mode: enter it, pick element ids, fire. Mirrors what a user does with the toolbar. */
export async function pickAreasAndTranslate(
  ext: ExtensionHandle,
  page: Page,
  ids: readonly string[],
): Promise<void> {
  const sw = ext.context.serviceWorkers()[0];
  if (!sw) throw new Error('[e2e] no service worker');
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) throw new Error('no tab');
    await chrome.tabs.sendMessage(tabId, { kind: 'page:chooseAreas' });
  });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await egaTest<boolean>(page, 'msIsActive')) === true) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  for (const id of ids) {
    const picked = await egaTest<boolean>(page, 'msSelectById', id);
    if (picked !== true) throw new Error(`[e2e] could not pick area #${id}`);
  }
  const fired = await egaTest<boolean>(page, 'msFire');
  if (fired !== true) throw new Error('[e2e] translate button did not fire');
}

/** Opens a built-in task's edit dialog on the Tasks tab, where its prompt editor lives. Translate's prompt is the global one. */
export async function openTaskPrompt(page: Page, task: string): Promise<void> {
  await page.locator('#tab-tasks').click();
  await page.locator(`[data-ega-task-edit="${task}"]`).click();
  await page.locator(`[data-ega-task-dialog="${task}"] [data-ega-prompt-editor]`).waitFor({
    timeout: 10_000,
  });
}

/** Opens one language's dialog from its row on the Languages tab; returns the dialog. */
export async function openLanguageDialog(page: Page, id: string, label: string): Promise<Locator> {
  await page.locator('#tab-languages').click();
  await page.getByLabel('Filter languages').fill(label);
  await page
    .locator(`[data-ega-variety-row="${id}"]`)
    .getByRole('button', { name: `Edit ${label}` })
    .click();
  const dialog = page.locator(`[data-ega-language-dialog="${id}"]`);
  await dialog.waitFor({ timeout: 10_000 });
  return dialog;
}

/** Opens a language's dialog and picks "Use its own prompt", which shows the prompt editor. */
export async function openLanguagePrompt(page: Page, id: string, label: string): Promise<Locator> {
  const dialog = await openLanguageDialog(page, id, label);
  await dialog.getByRole('radio', { name: 'Use its own prompt' }).click();
  await dialog.locator('[data-ega-prompt-editor]').waitFor({ timeout: 10_000 });
  return dialog;
}

/** Types a message into the side panel composer and sends it with Enter, the composer's send key. */
export async function sendFromPanel(page: Page, text: string): Promise<void> {
  const box = page.locator('#sp-text');
  await box.waitFor({ state: 'visible', timeout: 5_000 });
  await box.fill(text);
  await box.press('Enter');
}

/**
 * Sets what the next side panel message does, in the composer's "Next message" popover, then closes it.
 * Values are a task id, language ids (`auto` for the source) and a tone id.
 */
export async function setNextMessage(
  page: Page,
  next: { task?: string; source?: string; target?: string; tone?: string },
): Promise<void> {
  const chip = page.locator('[data-ega-mode-chip]');
  if ((await chip.getAttribute('aria-expanded')) !== 'true') await chip.click();
  const popover = page.locator('[data-ega-mode-popover]');
  await popover.waitFor({ state: 'visible', timeout: 5_000 });
  if (next.task !== undefined) await popover.locator(`[data-ega-task="${next.task}"]`).click();
  if (next.source !== undefined) await popover.locator('#sp-conv-source').selectOption(next.source);
  if (next.target !== undefined) await popover.locator('#sp-conv-target').selectOption(next.target);
  if (next.tone !== undefined)
    await popover.locator('[data-ega-tone-select]').selectOption(next.tone);
  await page.keyboard.press('Escape');
  await popover.waitFor({ state: 'hidden', timeout: 5_000 });
}

/** The side panel reply that finished last; older replies show their action row only on hover. */
export function newestReply(page: Page): Locator {
  return page.locator('[data-ega-reply]').last();
}

/** Opens a reply's Refine or More menu (the newest reply by default) and returns the open menu. */
export async function openReplyMenu(
  page: Page,
  which: 'refine' | 'more',
  reply: Locator = newestReply(page),
): Promise<Locator> {
  const trigger = reply.locator(`[data-ega-action="${which}"]`);
  await trigger.waitFor({ state: 'attached', timeout: 10_000 });
  await reply.hover();
  await trigger.click();
  const menu = page.getByRole('menu');
  await menu.waitFor({ state: 'visible', timeout: 5_000 });
  return menu;
}

/** Re-runs a reply with one of its Refine presets (`shorter`, `less-formal`, `keep-slang`, …). */
export async function refineWithPreset(
  page: Page,
  preset: string,
  reply: Locator = newestReply(page),
): Promise<void> {
  const menu = await openReplyMenu(page, 'refine', reply);
  await menu.locator(`[data-ega-refine-preset="${preset}"]`).click();
}

/** Refine → "Describe a change…", then sends `change` from the composer, which is in its refine mode. */
export async function describeChange(
  page: Page,
  change: string,
  reply: Locator = newestReply(page),
): Promise<void> {
  const menu = await openReplyMenu(page, 'refine', reply);
  await menu.locator('[data-ega-describe-change]').click();
  await page.locator('[data-ega-mode-banner]').waitFor({ state: 'visible', timeout: 5_000 });
  await sendFromPanel(page, change);
}
