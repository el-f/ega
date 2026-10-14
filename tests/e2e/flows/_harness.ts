/** Flow-test harness. One journey per file: mark a latency, assert visible DOM. `egaTest` peeks are setup only. */

import { expect, type Page, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export interface StepTiming {
  name: string;
  ms: number;
}

/** `markStep(name)` records the time since the last mark; `report()` returns the timeline. */
export function createTimeline(): {
  markStep: (name: string) => void;
  report: () => StepTiming[];
} {
  const steps: StepTiming[] = [];
  let last = performance.now();
  return {
    markStep: (name: string) => {
      const now = performance.now();
      steps.push({ name, ms: Math.round(now - last) });
      last = now;
    },
    report: () => steps,
  };
}

/** A one-frame Anthropic SSE stream whose text is `{ translation, confidence: 1 }`. */
export function sseOk(translation: string): string {
  const json = JSON.stringify({ translation, confidence: 1 });
  return [
    `event: message_start`,
    `data: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[]}}`,
    ``,
    `event: content_block_start`,
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
    ``,
    `event: content_block_delta`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(json)}}}`,
    ``,
    `event: content_block_stop`,
    `data: {"type":"content_block_stop","index":0}`,
    ``,
    `event: message_stop`,
    `data: {"type":"message_stop"}`,
    ``,
  ].join('\n');
}

/** Poll for on-screen text inside the content-script shadow host. Component state can pass while the render is broken. */
export async function waitForVisibleText(
  page: Page,
  selector: string,
  match: RegExp | string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  await expect
    .poll(
      async () =>
        await page.evaluate(
          ({ sel, m, rx }) => {
            const host = document.querySelector('#ega-shadow-host');
            const root =
              (host as HTMLElement | null)?.shadowRoot ??
              (host as unknown as Document | null) ??
              document;
            const el = root.querySelector(sel);
            if (!el) return '';
            const text = el.textContent;
            if (rx) return new RegExp(m).test(text) ? text : '';
            return text.includes(m) ? text : '';
          },
          {
            sel: selector,
            m: typeof match === 'string' ? match : match.source,
            rx: match instanceof RegExp,
          },
        ),
      { timeout: timeoutMs },
    )
    .not.toBe('');
  return await page.evaluate((sel: string) => {
    const host = document.querySelector('#ega-shadow-host');
    const root =
      (host as HTMLElement | null)?.shadowRoot ?? (host as unknown as Document | null) ?? document;
    return root.querySelector(sel)?.textContent ?? '';
  }, selector);
}

/** Samples across the window and fails the instant it deviates — a sleep-then-read misses a mid-window blip. */
export async function assertStaysStable<T>(
  probe: () => Promise<T> | T,
  expected: T,
  opts: { windowMs?: number; intervalMs?: number; message?: string } = {},
): Promise<void> {
  const windowMs = opts.windowMs ?? 1_000;
  const intervalMs = opts.intervalMs ?? 100;
  const deadline = Date.now() + windowMs;
  // JSON both sides — Playwright matcher types do not resolve for an unconstrained T.
  const want = JSON.stringify(expected);
  do {
    const got = JSON.stringify(await probe());
    expect(got, opts.message).toBe(want);
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() < deadline);
}

export interface FocusStop {
  /** aria-label, else id, else trimmed text: enough to name the stop in a failure. */
  name: string;
  /** Laid out with a non-zero box and not visibility:hidden. */
  visible: boolean;
  /** An outline or box-shadow on the element, or an outline on a near wrapper (`:focus-within` rings). */
  ring: boolean;
}

/** The focused element, through open shadow roots; null when focus is on the body or left the page. */
export async function readFocus(page: Page): Promise<FocusStop | null> {
  return page.evaluate(() => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const outlined = (n: Element): boolean => {
      const st = getComputedStyle(n);
      return st.outlineStyle !== 'none' && Number.parseFloat(st.outlineWidth) > 0;
    };
    // Cards carry a resting box-shadow, so a wrapper only counts by its outline.
    const wrappers = [el.parentElement, el.parentElement?.parentElement].filter(
      (n): n is HTMLElement => n !== null && n !== undefined,
    );
    const text = el.textContent.trim().slice(0, 40);
    return {
      name: [el.getAttribute('aria-label'), el.id, text].find(Boolean) ?? el.tagName.toLowerCase(),
      visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden',
      ring: outlined(el) || s.boxShadow !== 'none' || wrappers.some(outlined),
    };
  });
}

/** axe scan tuned for Ega: only critical + serious fail; landmark rules run on the extension's own pages only. */
export async function assertA11y(
  page: Page,
  opts: { allow?: string[]; disable?: string[] } = {},
): Promise<void> {
  // On a host web page only the shadow surface is ours, so the page's own landmarks are not checked.
  const ownPage = page.url().startsWith('chrome-extension://');
  const disableRules = [
    ...(ownPage ? [] : ['landmark-one-main', 'region']),
    ...(opts.disable ?? []),
    ...(opts.allow ?? []),
  ];
  const results = await new AxeBuilder({ page }).disableRules(disableRules).analyze();
  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious = results.violations.filter((v) => v.impact === 'serious');
  // An axe stack trace alone drops the rule id + node selector when expect() fails.
  const summarise = (
    bucket: typeof results.violations,
  ): { id: string; help: string; selectors: string[] }[] =>
    bucket.map((v) => ({
      id: v.id,
      help: v.help,
      selectors: v.nodes
        .slice(0, 3)
        .map((n) => (Array.isArray(n.target) ? n.target.join(' > ') : String(n.target))),
    }));
  expect(critical, JSON.stringify(summarise(critical), null, 2)).toEqual([]);
  expect(serious, JSON.stringify(summarise(serious), null, 2)).toEqual([]);
}

/** Runs `action` on the first surface and returns the page it opens, matched by `expects.url` or `expects.predicate`. */
export async function crossSurfaceFlow<T = Page>(
  context: BrowserContext,
  args: {
    from: { url: string } | { page: Page };
    action: (fromPage: Page) => Promise<void>;
    expects:
      | { url: string | RegExp }
      | { predicate: (page: Page) => Promise<boolean>; timeoutMs?: number };
    after?: (toPage: Page) => Promise<T>;
  },
): Promise<{ fromPage: Page; toPage: Page; result: T | null }> {
  const fromPage = 'page' in args.from ? args.from.page : await context.newPage();
  if ('url' in args.from) {
    await fromPage.goto(args.from.url);
    await fromPage.waitForLoadState('domcontentloaded');
  }
  // Subscribe before the action — a synchronous action would otherwise open the page first.
  const newPagePromise = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
  await args.action(fromPage);
  const toPage = (await newPagePromise) ?? fromPage;
  await toPage.waitForLoadState('domcontentloaded');
  if ('url' in args.expects) {
    const exp = args.expects.url;
    await expect
      .poll(() => toPage.url(), { timeout: 5_000 })
      .toMatch(
        typeof exp === 'string' ? new RegExp(exp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : exp,
      );
  } else {
    const predicate = args.expects.predicate;
    const timeoutMs = args.expects.timeoutMs ?? 5_000;
    await expect.poll(async () => await predicate(toPage), { timeout: timeoutMs }).toBe(true);
  }
  const result = args.after ? await args.after(toPage) : null;
  return { fromPage, toPage, result };
}

/** Match the last body a mock captured: object = deep partial match, RegExp = raw body, function = both. */
export interface MockWithBody {
  lastRequestBody: () => string | null;
}

export function assertRequestShape(
  mock: MockWithBody,
  predicate: RegExp | ((body: string, parsed: unknown) => boolean) | Record<string, unknown>,
): void {
  const body = mock.lastRequestBody();
  expect(body, 'mock never captured a request body').not.toBeNull();
  const raw = body as string;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw;
  }
  if (predicate instanceof RegExp) {
    expect(raw).toMatch(predicate);
    return;
  }
  if (typeof predicate === 'function') {
    expect(predicate(raw, parsed), `predicate rejected request body: ${raw.slice(0, 200)}`).toBe(
      true,
    );
    return;
  }
  const reasons: string[] = [];
  const matches = partialMatch(parsed, predicate, '', reasons);
  expect(matches, reasons.join('\n') || 'partial match failed').toBe(true);
}

export interface CrossSurfaceMessage {
  channel: string;
  payload: unknown;
  at: number;
}

export interface BusQueue extends AsyncIterableIterator<CrossSurfaceMessage> {
  /** Test-only seed entry point; real messages arrive via the `attachToPage` tap. */
  _push: (msg: CrossSurfaceMessage) => void;
}

/** Async iterator over `chrome.runtime` broadcasts in arrival order, so a spec can await a message instead of sleeping. */
export function captureCrossSurfaceBus(
  context: Pick<BrowserContext, 'on' | 'pages'>,
  filter: (msg: CrossSurfaceMessage) => boolean,
): BusQueue {
  const buffer: CrossSurfaceMessage[] = [];
  const waiters: Array<(msg: CrossSurfaceMessage) => void> = [];

  function push(msg: CrossSurfaceMessage): void {
    if (!filter(msg)) return;
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else buffer.push(msg);
  }

  async function attachToPage(page: Page): Promise<void> {
    const forwarderName = `__egaBusForward_${Math.random().toString(36).slice(2, 10)}`;
    try {
      await page.exposeFunction(forwarderName, (m: CrossSurfaceMessage) => {
        push(m);
      });
    } catch {
      // exposeFunction is idempotent-failing per name; ignore re-attach in tests
    }
    await page.evaluate((name: string) => {
      const g = globalThis as unknown as {
        chrome?: {
          runtime?: {
            onMessage?: {
              addListener: (cb: (msg: { channel?: string; payload?: unknown }) => void) => void;
            };
          };
        };
        __egaBusTapped__?: boolean;
      } & Record<string, (m: { channel: string; payload: unknown; at: number }) => void>;
      if (g.__egaBusTapped__) return;
      g.__egaBusTapped__ = true;
      const cb = (msg: { channel?: string; payload?: unknown }): void => {
        if (!msg.channel) return;
        try {
          g[name]?.({ channel: msg.channel, payload: msg.payload, at: Date.now() });
        } catch {
          /* swallow */
        }
      };
      g.chrome?.runtime?.onMessage?.addListener(cb);
    }, forwarderName);
  }

  context.on('page', (page: Page) => {
    void attachToPage(page);
  });
  for (const page of context.pages()) void attachToPage(page);

  const queue: BusQueue = {
    _push: push,
    next() {
      const buffered = buffer.shift();
      if (buffered) return Promise.resolve({ value: buffered, done: false });
      return new Promise<IteratorResult<CrossSurfaceMessage>>((resolve) => {
        waiters.push((msg) => resolve({ value: msg, done: false }));
      });
    },
    return() {
      return Promise.resolve({ value: undefined as unknown as CrossSurfaceMessage, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return queue;
}

/** Patch settings mid-translate; returns a cleanup that restores the prior values (call it from `afterEach`). */
export async function mutateSettingsMidFlight(
  page: Pick<Page, 'evaluate'>,
  patch: Record<string, unknown>,
  opts: { settle?: 'next-attempt' | 'next-frame' } = {},
): Promise<() => Promise<void>> {
  const keys = Object.keys(patch);
  const prior = (await page.evaluate(
    (arg: { kind: 'read'; ks: string[] }) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const c = (
          globalThis as unknown as {
            chrome?: {
              storage?: {
                local?: { get?: (k: string[], cb: (v: Record<string, unknown>) => void) => void };
              };
            };
          }
        ).chrome;
        if (c?.storage?.local?.get) c.storage.local.get(arg.ks, (v) => resolve(v));
        else resolve({});
      }),
    { kind: 'read' as const, ks: keys },
  )) as Record<string, unknown>;

  await page.evaluate(
    (arg: { kind: 'write'; patch: Record<string, unknown> }) =>
      new Promise<void>((resolve) => {
        const c = (
          globalThis as unknown as {
            chrome?: {
              storage?: { local?: { set?: (v: Record<string, unknown>, cb: () => void) => void } };
            };
          }
        ).chrome;
        if (c?.storage?.local?.set) c.storage.local.set(arg.patch, () => resolve());
        else resolve();
      }),
    { kind: 'write' as const, patch },
  );

  if (opts.settle === 'next-frame') {
    await page.evaluate(
      (_arg: { kind: 'waitFrame' }) =>
        new Promise<void>((r) => {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r());
          else setTimeout(() => r(), 0);
        }),
      { kind: 'waitFrame' as const },
    );
  }

  return async () => {
    await page.evaluate(
      (arg: { kind: 'write'; patch: Record<string, unknown> }) =>
        new Promise<void>((resolve) => {
          const c = (
            globalThis as unknown as {
              chrome?: {
                storage?: {
                  local?: { set?: (v: Record<string, unknown>, cb: () => void) => void };
                };
              };
            }
          ).chrome;
          if (c?.storage?.local?.set) c.storage.local.set(arg.patch, () => resolve());
          else resolve();
        }),
      { kind: 'write' as const, patch: prior },
    );
  };
}

// String contains, RegExp tests, number equals, object recurses; `reasons` names the key that mismatched.
function partialMatch(
  actual: unknown,
  expected: unknown,
  pathPrefix: string,
  reasons: string[],
): boolean {
  if (expected instanceof RegExp) {
    if (typeof actual === 'string' && expected.test(actual)) return true;
    reasons.push(`${pathPrefix}: expected match ${expected.source}, got ${JSON.stringify(actual)}`);
    return false;
  }
  if (typeof expected === 'string') {
    if (typeof actual === 'string' && actual.includes(expected)) return true;
    reasons.push(`${pathPrefix}: expected contains "${expected}", got ${JSON.stringify(actual)}`);
    return false;
  }
  if (typeof expected === 'number' || typeof expected === 'boolean' || expected === null) {
    if (actual === expected) return true;
    reasons.push(
      `${pathPrefix}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    return false;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      reasons.push(`${pathPrefix}: expected array, got ${typeof actual}`);
      return false;
    }
    let ok = true;
    for (let i = 0; i < expected.length; i++) {
      if (!partialMatch(actual[i], expected[i], `${pathPrefix}[${i}]`, reasons)) ok = false;
    }
    return ok;
  }
  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || actual === null) {
      reasons.push(`${pathPrefix}: expected object, got ${typeof actual}`);
      return false;
    }
    let ok = true;
    for (const [k, v] of Object.entries(expected)) {
      const childPath = pathPrefix ? `${pathPrefix}.${k}` : k;
      if (!partialMatch((actual as Record<string, unknown>)[k], v, childPath, reasons)) ok = false;
    }
    return ok;
  }
  return false;
}
