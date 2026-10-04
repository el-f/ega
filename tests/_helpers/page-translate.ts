import { vi } from 'vitest';
import { runPageTranslateV2, type PageV2Deps } from '@/content/page-translate-v2';
import type { Settings } from '@/shared/types';

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
