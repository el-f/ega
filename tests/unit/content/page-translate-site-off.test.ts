// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { currentSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { flushAsync } from '@tests/_helpers/async';
// Static, so the lazy chunks resolve off the warm module graph, not mid-teardown.
import { cancelPageTranslateV2 } from '@/content/page-translate-v2';
import '@/content/batch-progress';

/** A stand-in for the viewport band: the test says which blocks are near. */
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
  band(near: Set<Element>): void {
    const entries = [...this.observed].map(
      (target) => ({ target, isIntersecting: near.has(target) }) as IntersectionObserverEntry,
    );
    this.cb(entries, this as unknown as IntersectionObserver);
  }
}

await import('@/content/index');

// jsdom serves the page at http://localhost:3000, which is what location.origin reads.
const ORIGIN = 'http://localhost:3000';

function seed(sitePrefs: Record<string, unknown>): Promise<void> {
  return chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, sitePrefs },
  });
}

function starts(): number {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls.filter(
    (c) => (c[0] as { kind?: string }).kind === 'translate:start',
  ).length;
}

// The config unstubs globals before each test, so the stub goes here, not at module level.
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  FakeObserver.last = null;
});

afterEach(async () => {
  await cancelPageTranslateV2();
  document.body.innerHTML = '';
});

describe('the site switch reaches a running page translate', () => {
  it('turning Ega off on the site stops the whole-page session before its next send', async () => {
    await seed({});
    resetSettingsCacheForTest();
    (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
    document.body.innerHTML = Array.from(
      { length: 12 },
      (_, i) => `<p id="p${i}">これは${i}番目の段落です。</p>`,
    ).join('');
    const els = [...document.querySelectorAll('p')];

    chromeMock.runtime.onMessage.emit(
      { kind: 'page:translateAll' },
      { id: chromeMock.runtime.id },
      () => {},
    );
    // The first run loads the page-translate chunk and compiles the pill, which takes a while under vitest.
    await vi.waitFor(() => expect(FakeObserver.last?.observed.size).toBe(12), { timeout: 10_000 });
    FakeObserver.last?.band(new Set(els.slice(0, 2)));
    await vi.waitFor(() => expect(starts()).toBe(2));

    await seed({ [ORIGIN]: { disabled: true } });
    // A content script hears about stored changes from the worker, by key name only.
    chromeMock.runtime.onMessage.emit(
      { kind: 'content:storage-changed', keys: [STORAGE_KEYS.settings] },
      { id: chromeMock.runtime.id },
      () => {},
    );
    await vi.waitFor(() => expect(currentSettings()?.sitePrefs[ORIGIN]?.disabled).toBe(true));
    FakeObserver.last?.band(new Set(els.slice(2, 8)));
    await flushAsync();
    expect(starts()).toBe(2);
  }, 20_000);
});
