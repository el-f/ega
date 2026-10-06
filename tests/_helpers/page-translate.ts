import { vi } from 'vitest';
import { runPageTranslateV2, type PageV2Deps } from '@/content/page-translate-v2';
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
