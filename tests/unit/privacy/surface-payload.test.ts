// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/svelte';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { flushAsync } from '@tests/_helpers/async';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { PageContext, Settings } from '@/shared/types';
import { ensureSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { pending } from '@/content/request-state';
import { explainTranslate } from '@/content/translate-handlers';
import { cancelPageTranslateV2 } from '@/content/page-translate-v2';
import '@/content/batch-progress';
import '@/content/tipState.svelte';
import { buildStartArgs, type Turn, type TurnDispatch } from '@/sidepanel/state/conversation';
import { sendTranslateStart } from '@/shared/translate-ui';
import { dispatchImageTranslate } from '@/background/imageTranslateDispatch';
import BackendCard from '@/options/components/BackendCard.svelte';
import { resolveBackend } from '@/shared/backends/registry';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';

// Pins docs/PRIVACY.md "What each surface sends" to each surface's real request; "Saved in a thread" is local, not checked.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const POLICY = readFileSync(path.join(ROOT, 'docs/PRIVACY.md'), 'utf8');

type Cell = 'yes' | 'no' | 'fixed' | 'meta-only' | 'conditional';
const COLUMNS = {
  text: 'Text you picked',
  titleUrl: 'Page title + URL',
  around: 'Text around your selection',
  rich: 'Rich extras',
  history: 'Earlier turns',
  image: 'Image bytes',
} as const;
type Column = keyof typeof COLUMNS;
type Row = Record<Column, Cell> & { cap: number | null };

/** Turns the prose cell into a class; an unknown wording fails, so a policy edit forces a test edit. */
function normalize(cell: string): Cell {
  const c = cell.trim().toLowerCase();
  if (/^(?:explain only|when you attach|explain image and your image tasks only)/.test(c)) {
    return 'conditional';
  }
  if (c === 'page language, description, site name only') return 'meta-only';
  if (c === 'a fixed sample sentence') return 'fixed';
  if (c === 'one request per page block') return 'yes';
  if (/^yes\b/.test(c)) return 'yes';
  if (/^no\b/.test(c)) return 'no';
  throw new Error(`docs/PRIVACY.md: no class for the cell "${cell}"`);
}

function parseSurfaceTable(md: string): Map<string, Row> {
  const section = md.split('## What each surface sends')[1]?.split('\n## ')[0] ?? '';
  const lines = section.split('\n').filter((l) => l.trim().startsWith('|'));
  const split = (l: string): string[] =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  const header = split(lines[0] ?? '');
  const rows = new Map<string, Row>();
  for (const line of lines.slice(2)) {
    const cells = split(line);
    const at = (name: string): string => {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`docs/PRIVACY.md: the table has no "${name}" column`);
      return cells[i] ?? '';
    };
    const textCell = at(COLUMNS.text);
    const row = { cap: Number(/cut to (\d+)/.exec(textCell)?.[1] ?? NaN) || null } as Row;
    for (const [key, name] of Object.entries(COLUMNS) as [Column, string][]) {
      row[key] = normalize(at(name));
    }
    rows.set((cells[0] ?? '').replace(/\*\*/g, ''), row);
  }
  return rows;
}

const TABLE = parseSurfaceTable(POLICY);
function policyRow(label: string): Row {
  const hits = [...TABLE.entries()].filter(([k]) => k.includes(label));
  expect(
    hits.map(([k]) => k),
    `one policy row names "${label}"`,
  ).toHaveLength(1);
  return (hits[0] as [string, Row])[1];
}

/** What one request carried, in the table's terms. */
interface Sent {
  text?: string | undefined;
  context?: PageContext | undefined;
  history?: readonly unknown[] | undefined;
  imageUrl?: string | undefined;
}

function observed(s: Sent): Record<Exclude<Column, 'image'>, Cell> & { image: 'yes' | 'no' } {
  const c = s.context ?? {};
  const deep = c.headingTrail !== undefined || c.postText !== undefined;
  const meta =
    c.pageLang !== undefined || c.pageDescription !== undefined || c.siteName !== undefined;
  return {
    text: s.text ? 'yes' : 'no',
    titleUrl: c.pageTitle !== undefined && c.pageUrl !== undefined ? 'yes' : 'no',
    around: c.beforeText || c.afterText ? 'yes' : 'no',
    rich: deep ? 'yes' : meta ? 'meta-only' : 'no',
    history: s.history && s.history.length > 0 ? 'yes' : 'no',
    image: s.imageUrl ? 'yes' : 'no',
  };
}

/** Every column but the conditional image cell must match; the caller checks that cell's two halves. */
function expectRowMatches(row: Row, sent: Sent): void {
  const seen = observed(sent);
  for (const key of Object.keys(COLUMNS) as Column[]) {
    const want = row[key];
    if (want === 'conditional') continue;
    expect(seen[key], `${COLUMNS[key]}`).toBe(want === 'fixed' ? 'yes' : want);
  }
}

// ---- content-script harness: the real content entry points, driven by their messages ----

const dominantImage = vi.fn<() => string | null>(() => null);
vi.mock('@/content/dominant-image', () => ({ findDominantPostImage: () => dominantImage() }));

let pick: ((text: string, rect: DOMRect) => void) | null = null;
vi.mock('@/content/picker-overlay', () => ({
  enterPickerMode: (onPick: (text: string, rect: DOMRect) => void) => {
    pick = onPick;
    return Promise.resolve();
  },
}));

class FakeObserver {
  static last: FakeObserver | null = null;
  readonly observed = new Set<Element>();
  constructor(readonly cb: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }
  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.observed.clear();
  }
  bandAll(): void {
    const entries = [...this.observed].map(
      (target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    );
    this.cb(entries, this as unknown as IntersectionObserver);
  }
}

const content = await import('@/content/index');

const RECT = {
  left: 0,
  top: 0,
  right: 10,
  bottom: 10,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  toJSON: () => ({}),
} as DOMRect;
const LONG = 'mot '.repeat(700).trim();

interface StartMsg {
  kind: 'translate:start';
  text: string;
  context?: PageContext;
  options: {
    explain: boolean;
    imageUrl?: string;
    conversationHistory?: unknown[];
    batch?: boolean;
  };
}
function starts(): StartMsg[] {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as { kind?: string })
    .filter((m): m is StartMsg => m.kind === 'translate:start');
}
const sentOf = (m: StartMsg): Sent => ({
  text: m.text,
  context: m.context,
  history: m.options.conversationHistory,
  imageUrl: m.options.imageUrl,
});

/** Rich level: a "yes" cell is what the widest setting can send; a "no" cell must stay absent even then. */
async function seed(sitePrefs: Settings['sitePrefs']): Promise<void> {
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    contextEnabled: true,
    pageContextLevel: 'rich',
    explainUsesPageImage: true,
    sitePrefs,
  };
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: s });
  resetSettingsCacheForTest();
  await ensureSettings();
}

function ask(msg: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(msg, { id: chromeMock.runtime.id }, resolve);
  });
}

function richPage(selected: string): void {
  document.documentElement.lang = 'fr';
  document.head.innerHTML =
    '<meta name="description" content="A page about tests"><meta property="og:site_name" content="Example">';
  // After the head: replacing the head drops its <title>.
  document.title = 'Policy page';
  document.body.innerHTML = `<article><h1>Top heading</h1><section><h2>Part</h2><p id="p">before words <span id="sel">${selected}</span> after words</p></section></article>`;
}

function selectSpan(): void {
  const node = document.getElementById('sel');
  if (!node) throw new Error('no selection target');
  const r = document.createRange();
  r.selectNodeContents(node);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

beforeEach(() => {
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  (chromeMock.runtime.sendMessage as Mock).mockClear();
  dominantImage.mockReturnValue(null);
  pick = null;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  FakeObserver.last = null;
});

afterEach(async () => {
  await cancelPageTranslateV2();
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('docs/PRIVACY.md "What each surface sends"', () => {
  it('lists exactly the six surfaces this test probes', () => {
    const probed = [
      'Selection bubble',
      'Element picker',
      'Translate page',
      'Side panel',
      'Translate image',
      'Test now',
    ];
    expect(TABLE.size).toBe(probed.length);
    for (const label of probed) policyRow(label);
  });

  describe('selection bubble, shortcut, "Ega ▸ Translate"', () => {
    it('sends what the row says, cut to the stated cap', async () => {
      const row = policyRow('Selection bubble');
      await seed({});
      richPage(LONG);
      selectSpan();
      await ask({ kind: 'hotkey:translate' });
      await vi.waitFor(() => expect(starts()).toHaveLength(1));
      const msg = starts()[0] as StartMsg;
      expectRowMatches(row, sentOf(msg));
      expect(msg.text.length).toBe(row.cap);
    });

    it('sends the page image only with Explain, and only when one image dominates', async () => {
      const row = policyRow('Selection bubble');
      expect(row.image).toBe('conditional');
      await seed({});
      richPage('bonjour');
      selectSpan();
      dominantImage.mockReturnValue('https://example.com/hero.png');
      await ask({ kind: 'hotkey:translate' });
      await vi.waitFor(() => expect(starts()).toHaveLength(1));
      expect(starts()[0]?.options.imageUrl).toBeUndefined();

      const id = [...pending.keys()].at(-1) as string;
      await explainTranslate({ ensureSettings }, id);
      await vi.waitFor(() => expect(starts()).toHaveLength(2));
      expect(starts()[1]?.options).toMatchObject({
        explain: true,
        imageUrl: 'https://example.com/hero.png',
      });

      dominantImage.mockReturnValue(null);
      await explainTranslate({ ensureSettings }, [...pending.keys()].at(-1) as string);
      await vi.waitFor(() => expect(starts()).toHaveLength(3));
      expect(starts()[2]?.options.imageUrl).toBeUndefined();
    });

    it('sends nothing on a site turned off', async () => {
      await seed({ 'http://localhost:3000': { disabled: true } });
      richPage('bonjour');
      selectSpan();
      await ask({ kind: 'hotkey:translate' });
      await flushAsync();
      await content.startTranslateText('bonjour', RECT);
      expect(starts()).toEqual([]);
    });
  });

  describe('element picker', () => {
    it('sends what the row says, cut to the stated cap', async () => {
      const row = policyRow('Element picker');
      await seed({});
      richPage('bonjour');
      await content.enterPickerMode();
      expect(pick).not.toBeNull();
      pick?.(LONG, RECT);
      await vi.waitFor(() => expect(starts()).toHaveLength(1));
      const msg = starts()[0] as StartMsg;
      expectRowMatches(row, sentOf(msg));
      expect(msg.text.length).toBe(row.cap);
    });

    it('never opens on a site turned off', async () => {
      await seed({ 'http://localhost:3000': { disabled: true } });
      await content.enterPickerMode();
      expect(pick).toBeNull();
      expect(starts()).toEqual([]);
    });
  });

  describe('"Translate page"', () => {
    async function runWholePage(): Promise<void> {
      document.body.innerHTML = Array.from(
        { length: 3 },
        (_, i) => `<p id="p${i}">これは${i}番目の段落です。</p>`,
      ).join('');
      document.title = 'Policy page';
      chromeMock.runtime.onMessage.emit(
        { kind: 'page:translateAll' },
        { id: chromeMock.runtime.id },
        () => {},
      );
      await vi.waitFor(() => expect(FakeObserver.last?.observed.size ?? 0).toBeGreaterThan(0));
      FakeObserver.last?.bandAll();
    }

    it('sends one block per request and nothing about the page', async () => {
      const row = policyRow('Translate page');
      await seed({});
      await runWholePage();
      await vi.waitFor(() => expect(starts().length).toBeGreaterThan(0));
      for (const msg of starts()) {
        expect(msg.options.batch).toBe(true);
        expectRowMatches(row, sentOf(msg));
      }
    });

    it('sends nothing on a site turned off', async () => {
      await seed({ 'http://localhost:3000': { disabled: true } });
      document.body.innerHTML = '<p>これは段落です。</p>';
      chromeMock.runtime.onMessage.emit(
        { kind: 'page:translateAll' },
        { id: chromeMock.runtime.id },
        () => {},
      );
      await flushAsync();
      FakeObserver.last?.bandAll();
      await flushAsync();
      expect(starts()).toEqual([]);
    });
  });

  describe('side panel', () => {
    const reuse: TurnDispatch = {
      sourceLang: asLangIdUnsafe('fr'),
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    };
    const turn = (over: Partial<Turn> & { id: string; role: Turn['role'] }): Turn =>
      ({ kind: 'translate', status: 'done', content: 'x', createdAt: 1, ...over }) as Turn;

    async function pageContext(): Promise<PageContext | null> {
      const reply = (await ask({ kind: 'ega:get-page-context', level: 'rich' })) as {
        context: PageContext | null;
      };
      return reply.context;
    }

    it('sends what the row says: page context from the top of the page, and the earlier turns', async () => {
      const row = policyRow('Side panel');
      await seed({});
      richPage('bonjour');
      const context = await pageContext();
      const user = turn({
        id: 'u2',
        role: 'user',
        status: 'idle',
        content: 'bonjour',
        dispatch: reuse,
      });
      const thread = [
        turn({ id: 'u1', role: 'user', content: 'salut', dispatch: reuse }),
        turn({ id: 'a1', role: 'assistant', content: 'hi', attachedToTurnId: 'u1' }),
        user,
      ];
      await sendTranslateStart(buildStartArgs(user, { requestId: 'r1', reuse, context, thread }));
      expectRowMatches(row, sentOf(starts()[0] as StartMsg));
    });

    it('sends image bytes only when the user attached one', async () => {
      const row = policyRow('Side panel');
      expect(row.image).toBe('conditional');
      const plain = turn({
        id: 'u1',
        role: 'user',
        status: 'idle',
        content: 'bonjour',
        dispatch: reuse,
      });
      const attached = { ...plain, id: 'u2', imageDataUrl: 'data:image/png;base64,AA' } as Turn;
      await sendTranslateStart(buildStartArgs(plain, { requestId: 'r1', reuse, thread: [plain] }));
      await sendTranslateStart(
        buildStartArgs(attached, { requestId: 'r2', reuse, thread: [attached] }),
      );
      expect(starts().map((m) => m.options.imageUrl)).toEqual([
        undefined,
        'data:image/png;base64,AA',
      ]);
    });

    it('cannot pull the page context on a site turned off', async () => {
      await seed({ 'http://localhost:3000': { disabled: true } });
      richPage('bonjour');
      expect(await pageContext()).toBeNull();
    });
  });

  describe('right-click "Translate image" / "Explain image"', () => {
    const IMG = 'https://example.com/sign.png';

    /** What the router got for one menu click, with this page's content script answering the worker. */
    async function rightClick(task: string, settings: Settings): Promise<Record<string, unknown>> {
      (chromeMock.tabs.sendMessage as Mock).mockImplementation((_tab: number, msg: unknown) =>
        ask(msg as Record<string, unknown>),
      );
      const sent: Record<string, unknown>[] = [];
      const run = (req: object): Promise<void> => {
        sent.push({ ...req });
        return Promise.resolve();
      };
      try {
        await dispatchImageTranslate({
          tabId: 1,
          imageUrl: IMG,
          task,
          surface: 'tooltip',
          getSettings: () => Promise.resolve(settings),
          router: { handleImageTranslate: run, handleImageExplain: run },
          broadcast: () => {},
          sendToTab: () => {},
          logger: { error: () => {} },
        });
      } finally {
        (chromeMock.tabs.sendMessage as Mock).mockResolvedValue({ ok: true });
      }
      expect(sent).toHaveLength(1);
      return sent[0] as Record<string, unknown>;
    }

    function imagePage(): void {
      richPage('bonjour');
      const sel = document.getElementById('sel');
      if (sel) sel.innerHTML = `<img src="${IMG}" alt="A street sign">`;
    }

    const rich = (): Settings => ({
      ...DEFAULT_SETTINGS,
      contextEnabled: true,
      pageContextLevel: 'rich',
    });

    it('Translate image sends the picture and nothing else', async () => {
      const row = policyRow('Translate image');
      await seed({});
      imagePage();
      const req = await rightClick('translate', rich());
      expect(Object.keys(req).sort()).toEqual(['id', 'imageUrl']);
      expectRowMatches(row, { imageUrl: req['imageUrl'] as string });
      expect(observed({ context: req['context'] as PageContext })).toMatchObject({
        titleUrl: 'no',
        around: 'no',
        rich: 'no',
      });
    });

    it('Explain image and an image task also send the page context, taken around the image', async () => {
      const row = policyRow('Translate image');
      for (const cell of ['titleUrl', 'around', 'rich'] as const) {
        expect(row[cell], COLUMNS[cell]).toBe('conditional');
      }
      await seed({});
      imagePage();
      for (const task of ['explain', 'c-sign-check']) {
        const req = await rightClick(task, rich());
        const context = req['context'] as PageContext;
        expectRowMatches(row, { imageUrl: req['imageUrl'] as string, context });
        expect(observed({ context }), task).toMatchObject({
          titleUrl: 'yes',
          around: 'yes',
          rich: 'yes',
        });
        expect(context.imageAlt).toBe('A street sign');
      }
    });

    it('sends no page context with "Send page context" off or on a site turned off', async () => {
      await seed({ 'http://localhost:3000': { disabled: true } });
      imagePage();
      expect(await rightClick('explain', rich())).not.toHaveProperty('context');
      await seed({});
      expect(await rightClick('explain', { ...rich(), contextEnabled: false })).not.toHaveProperty(
        'context',
      );
    });
  });

  describe('Settings → Backends → Test now', () => {
    const backend = resolveBackend(asBackendIdUnsafe('anthropic'));
    if (!backend) throw new Error('anthropic backend not registered');
    const orig = { isAvailable: backend.isAvailable, translate: backend.translate };
    const calls: Parameters<typeof backend.translate>[0][] = [];

    beforeAll(() => {
      backend.isAvailable = () => Promise.resolve(true);
      backend.translate = (args) => {
        calls.push(args);
        args.onChunk({ type: 'done', requestId: args.req.id, text: 'hi' } as never);
        return Promise.resolve();
      };
      return () => {
        backend.isAvailable = orig.isAvailable;
        backend.translate = orig.translate;
      };
    });

    it('sends the same fixed sentence and nothing from any page', async () => {
      const row = policyRow('Test now');
      richPage('bonjour');
      const settings: Settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        anthropicApiKey: 'sk-ant-test',
      };
      const { container } = render(BackendCard, {
        props: { id: asBackendIdUnsafe('anthropic'), label: 'Anthropic', settings },
      });
      const button = (): HTMLButtonElement | null =>
        container.querySelector<HTMLButtonElement>('[data-testid="backend-card-test-anthropic"]');
      await vi.waitFor(() => expect(button()).not.toBeNull());
      button()?.click();
      await vi.waitFor(() => expect(calls).toHaveLength(1));
      await vi.waitFor(() => expect(button()?.textContent.trim()).toBe('Test now'));
      button()?.click();
      await vi.waitFor(() => expect(calls).toHaveLength(2));

      const [first, second] = calls;
      expect(first?.req.text).toBe(second?.req.text);
      expect(first?.user).toBe(first?.req.text);
      for (const call of calls) {
        expect(call.req.text).not.toContain('bonjour');
        expect(call.user).not.toContain('Policy page');
        expectRowMatches(row, {
          text: call.req.text,
          context: call.req.context,
          history: call.req.options.conversationHistory,
          imageUrl: call.req.options.imageUrl,
        });
      }
    });
  });
});
