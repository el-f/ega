import { vi } from 'vitest';
import {
  routePageV2Chunk,
  runPageTranslateV2,
  type PageV2Deps,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import type { Settings } from '@/shared/types';
import type { PageProgress } from '@/content/page-translate-v2/progress';

/** In-place mode, 3 batches in flight, mocked dispatch and register hooks. */
export function deps(over: Partial<PageV2Deps> = {}, settings: Partial<Settings> = {}): PageV2Deps {
  return {
    getSettings: () =>
      Promise.resolve({
        pageTranslateMode: 'inplace',
        batchConcurrency: 3,
        ...settings,
      } as unknown as Settings),
    dispatch: vi.fn((_requestId: string, _text: string) => Promise.resolve()),
    onRegister: vi.fn(),
    onUnregister: vi.fn(),
    ...over,
  };
}

export async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

/** Starts a session, clicks each element by id, then presses Enter to send them. */
export async function enterAndFire(d: PageV2Deps, ids: string[]): Promise<void> {
  await runPageTranslateV2(d);
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id}`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await flush();
}

/** A failed block's Try again button; it sits in the error chip's own shadow root. */
export function retryButton(root: ParentNode = document): HTMLButtonElement | null {
  const chip = root.querySelector('[data-ega-tx-error]');
  return chip?.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-retry-block]') ?? null;
}

/** The chip's visible text: the catalog title, plus Try again when the failure can be retried. */
export function chipText(root: ParentNode = document): string {
  return (
    root.querySelector('[data-ega-tx-error]')?.shadowRoot?.querySelector('.chip')?.textContent ?? ''
  );
}

/** A pill `update` that calls `settle` each time the session goes from running to settled, the old two-call contract. */
export function trackSettle(settle: (p: PageProgress) => void): (p: PageProgress) => void {
  let was = false;
  return (p) => {
    if (p.settled && !was) settle(p);
    was = p.settled;
  };
}

/** A stand-in for the viewport band: the test says which blocks are near. */
export class FakeObserver {
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
  /** One callback with an entry for every observed block, near or not. */
  band(near: Set<Element>): void {
    const entries = [...this.observed].map(
      (target) => ({ target, isIntersecting: near.has(target) }) as IntersectionObserverEntry,
    );
    this.cb(entries, this as unknown as IntersectionObserver);
  }
}

/** Whole-page dependencies with a recording pill: what was sent, every snapshot, and the pill handlers. */
export interface PageRig {
  sent: { id: string; text: string }[];
  updates: PageProgress[];
  live: string[];
  handle: ProgressHandle;
  d: PageV2Deps;
  /** Presses Stop. */
  stop: () => void;
  /** Presses Close bar; a no-op until the session registers it. */
  close: () => void;
  closeRegistered: () => boolean;
  dismissed: () => number;
}

export function rig(concurrency = 3): PageRig {
  const sent: { id: string; text: string }[] = [];
  const updates: PageProgress[] = [];
  const live: string[] = [];
  let onStop = (): void => {};
  let onClose: (() => void) | null = null;
  let dismissed = 0;
  const handle: ProgressHandle = {
    update: (p) => updates.push(p),
    setLiveMessage: (t) => live.push(t),
    setOnClose: (fn) => (onClose = fn),
    setOnUndoAll: vi.fn(),
    dismiss: () => dismissed++,
  };
  const d = deps(
    {
      dispatch: vi.fn((id: string, text: string) => {
        sent.push({ id, text });
        return Promise.resolve();
      }),
      mountProgress: (_total, stop) => {
        onStop = stop;
        return handle;
      },
      isTargetLanguage: () => false,
    },
    { batchConcurrency: concurrency },
  );
  return {
    sent,
    updates,
    live,
    handle,
    d,
    stop: () => onStop(),
    close: () => onClose?.(),
    closeRegistered: () => onClose !== null,
    dismissed: () => dismissed,
  };
}

/** Answers every sent block from `from` on with a finished translation. */
export function finishAll(r: PageRig, from = 0): void {
  for (const s of r.sent.slice(from)) {
    routePageV2Chunk({ type: 'delta', requestId: s.id, text: '{"translation":"T"}' });
    routePageV2Chunk({ type: 'done', requestId: s.id, confidence: 1 });
  }
}
