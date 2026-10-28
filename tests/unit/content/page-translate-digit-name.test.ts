// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { flushAsync } from '@tests/_helpers/async';
import { loadEnglishLexicon } from '@/content/looks-like-english';
// Static, so the lazy chunks resolve off the warm module graph, not mid-teardown.
import { cancelPageTranslateV2 } from '@/content/page-translate-v2';
import '@/content/batch-progress';

// Page translate runs the real detector here: a block already in the target language must stay on the page.

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

await import('@/content/index');

function sent(): { text?: string; sourceLang?: string }[] {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as { kind?: string; text?: string; sourceLang?: string })
    .filter((m) => m.kind === 'translate:start');
}

async function translatePage(target: string, paragraphs: string[]): Promise<void> {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, defaultTargetLang: target },
  });
  resetSettingsCacheForTest();
  (chromeMock.runtime.sendMessage as Mock).mockClear();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  document.body.innerHTML = paragraphs.map((p) => `<p>${p}</p>`).join('');
  chromeMock.runtime.onMessage.emit(
    { kind: 'page:translateAll' },
    { id: chromeMock.runtime.id },
    () => {},
  );
  // The first run loads the page-translate chunk and compiles the pill, which takes a while under vitest.
  await vi.waitFor(() => expect(FakeObserver.last?.observed.size).toBe(paragraphs.length), {
    timeout: 10_000,
  });
  FakeObserver.last?.bandAll();
  await vi.waitFor(() => expect(sent().length).toBeGreaterThan(0));
  await flushAsync();
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  FakeObserver.last = null;
});

afterEach(async () => {
  await cancelPageTranslateV2();
  document.body.innerHTML = '';
});

const FRENCH = 'Bonjour tout le monde, nous partons demain matin pour la plage.';

// A selection earlier in the tab loads the full word list.
describe('a tool name in a block already in the target language', () => {
  beforeEach(async () => {
    await loadEnglishLexicon();
  });

  it('leaves a Hebrew block with md5sum on a Hebrew page', async () => {
    await translatePage('he', ['בדקו את הקובץ עם md5sum לפני ההתקנה', FRENCH]);
    expect(sent().map((m) => m.text)).toEqual([FRENCH]);
  }, 20_000);

  it('leaves an English block with md5sum on an English page', async () => {
    await translatePage('en', [
      'Run md5sum on the file before you upload it to the server.',
      FRENCH,
    ]);
    expect(sent().map((m) => m.text)).toEqual([FRENCH]);
  }, 20_000);

  // The full word list reads a digit word as foreign; once the detector rules out Arabizi, it is a name or a number.
  it('leaves English blocks with sizes, hex values and library names on an English page', async () => {
    await translatePage('en', [
      'The monitor runs at 1920x1080 or 1280x720, and the old one only did 1024x768.',
      'The dump shows 0xdeadbeef at the top of the stack, so the pointer was never set.',
      'Everyone patched log4j quickly once the log4shell report came out.',
      'My old mp3player and my c3po figure are still in the box.',
      FRENCH,
    ]);
    expect(sent().map((m) => m.text)).toEqual([FRENCH]);
  }, 20_000);

  it('still sends an English page an Arabizi block the detector misses', async () => {
    await translatePage('en', ['bro wen enta? 3am estanak', FRENCH]);
    expect(sent().map((m) => m.text)).toEqual(['bro wen enta? 3am estanak', FRENCH]);
  }, 20_000);
});
