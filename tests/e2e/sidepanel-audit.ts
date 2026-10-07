// Fixtures and helpers for the side panel captures in screenshot-audit.spec.ts (side panel spec §13.1).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The site every capture is "on": a fixture page served as https://example.com. */
export const SITE = 'https://example.com';
/** Captures read the same day and time every run. */
export const NOW = new Date('2026-10-06T14:30:00').getTime();
const MIN = 60_000;

export const WIDTHS = [
  { tag: '400', viewport: { width: 400, height: 760 }, at: '400px' },
  { tag: '320', viewport: { width: 320, height: 760 }, at: '320px' },
  { tag: '256z', viewport: { width: 256, height: 760 }, at: '320px at 125% zoom' },
] as const;

/**
 * The panel opens as a tab here, so its "active tab" would be itself. This makes it follow the example.com
 * fixture tab instead, the way a real side panel follows the page beside it.
 */
export const FOLLOW_FIXTURE_SCRIPT = `
if (location.protocol === 'chrome-extension:' && location.pathname.includes('/src/sidepanel/') && globalThis.chrome?.tabs) {
  const realQuery = chrome.tabs.query.bind(chrome.tabs);
  chrome.tabs.query = async (q) => {
    if (q && q.active) {
      const all = await realQuery({});
      const page = all.find((t) => (t.url || '').startsWith('${SITE}/'));
      if (page) return [page];
    }
    return realQuery(q);
  };
  const realSend = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = (msg, ...rest) => {
    if (msg && msg.kind === 'translate:start') globalThis.__egaLastRequestId = msg.requestId;
    return realSend(msg, ...rest);
  };
}
`;

/** Serves the selection fixture as https://example.com/article and leaves it open, so the panel has a page beside it. */
export async function openExampleTab(context: BrowserContext): Promise<Page> {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'selection-page.html'), 'utf8');
  await context.route(`${SITE}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  );
  const page = await context.newPage();
  await page.goto(`${SITE}/article`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

type Json = Record<string, unknown>;

export interface ReplyOpts {
  content?: string;
  status?: 'done' | 'error';
  detectedLang?: string;
  detectedDetail?: string;
  detectedLangs?: { id: string; detail?: string }[];
  confidence?: number;
  explain?: string;
  meta?: Json | null;
  error?: Json;
  bookmarked?: boolean;
  variants?: Json[];
  activeVariantIdx?: number;
  kind?: string;
  retries?: number;
}

/** What a real Claude Haiku answer records when "Record request details" is on. */
export function realMeta(over: Json = {}): Json {
  return {
    backendId: 'anthropic',
    cacheHit: false,
    latencyMs: 1200,
    firstTokenMs: 400,
    modelId: 'claude-haiku-4-5-20251001',
    sourceLang: 'auto',
    targetLang: 'en',
    inputTokens: 42,
    outputTokens: 9,
    historyTurns: 0,
    pageContextSent: true,
    instructions:
      'You are a translator. Translate the user text into English.\nKeep slang and tone as they are. Return JSON ONLY: {"translation": string, "confidence": number}.',
    ...over,
  };
}

export function user(id: string, content: string, at: number, over: Json = {}): Json {
  return {
    id,
    role: 'user',
    kind: 'translate',
    status: 'idle',
    content,
    createdAt: at,
    dispatch: { sourceLang: 'auto', targetLang: 'en', stream: true },
    ...over,
  };
}

export function reply(id: string, parent: string, at: number, o: ReplyOpts = {}): Json {
  const content = o.content ?? 'Hello, friend.';
  const status = o.status ?? 'done';
  const meta = o.meta === null ? undefined : (o.meta ?? realMeta());
  const fields: Json = {
    ...(o.detectedLang !== undefined ? { detectedLang: o.detectedLang } : { detectedLang: 'es' }),
    ...(o.detectedDetail !== undefined ? { detectedDetail: o.detectedDetail } : {}),
    ...(o.detectedLangs !== undefined ? { detectedLangs: o.detectedLangs } : {}),
    confidence: o.confidence ?? 0.93,
    ...(o.explain !== undefined ? { explain: o.explain } : {}),
    ...(meta !== undefined ? { meta } : {}),
    ...(o.error !== undefined ? { error: o.error } : {}),
  };
  return {
    id,
    role: 'assistant',
    kind: o.kind ?? 'translate',
    status,
    content,
    createdAt: at,
    attachedToTurnId: parent,
    ...(o.bookmarked ? { bookmarked: true } : {}),
    ...(o.retries !== undefined ? { retries: o.retries } : {}),
    ...fields,
    variants: o.variants ?? [{ id: `${id}:v1`, status, content, ...fields }],
    activeVariantIdx: o.activeVariantIdx ?? 0,
  };
}

export interface SeedConversation {
  id: string;
  turns: Json[];
  updatedAt?: number;
}

/** Writes conversations the way the store does: index first, then each blob. Clears every earlier one. */
export async function seedConversations(
  page: Page,
  conversations: readonly SeedConversation[],
): Promise<void> {
  await page.evaluate(async (convs) => {
    const all = await chrome.storage.local.get(null);
    const old = Object.keys(all).filter((k) => k.startsWith('ega:conv:'));
    if (old.length > 0) await chrome.storage.local.remove(old);
    const title = (turns: Record<string, unknown>[]): string | undefined => {
      const first = turns.find((t) => t['role'] === 'user');
      const text = typeof first?.['content'] === 'string' ? first['content'] : '';
      const line =
        text
          .split('\n')
          .find((l) => l.trim() !== '')
          ?.trim() ?? '';
      return line === '' || line === '[image]' ? undefined : line.slice(0, 80);
    };
    const threads = convs.map((c) => ({
      origin: c.id,
      updatedAt: c.updatedAt ?? Date.now(),
      bytes: JSON.stringify(c.turns).length,
      messages: c.turns.length,
      ...(title(c.turns) !== undefined ? { title: title(c.turns) } : {}),
    }));
    await chrome.storage.local.set({ 'ega:conv:index': { version: 1, threads } });
    for (const c of convs) {
      await chrome.storage.local.set({
        [`ega:conv:t:${c.id}`]: {
          version: 1,
          origin: c.id,
          turns: c.turns,
          updatedAt: c.updatedAt ?? Date.now(),
        },
      });
    }
  }, conversations);
}

/** Opens the panel page; the clock is fixed so day separators read the same each run. */
export async function openPanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const sp = await context.newPage();
  await sp.clock.setFixedTime(NOW);
  await sp.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('domcontentloaded');
  return sp;
}

/** Reloads the panel onto the seeded store and waits for the first storage read to land. */
export async function reloadPanel(sp: Page): Promise<void> {
  await sp.reload();
  await sp.locator('[data-ega-header-site]').waitFor({ state: 'visible' });
  await sp.locator('[data-ega-backend-chip]').waitFor({ state: 'visible' });
  await sp.waitForTimeout(400); // wait for the mount-time storage read and Markdown chunk (no observable end state)
}

/** The answers the captures use: real shapes, with the detected-language fields a model sends. */
export const T = (minsAgo: number): number => NOW - minsAgo * MIN;
