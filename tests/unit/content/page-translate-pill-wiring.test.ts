// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { TranslationChunk } from '@/shared/types';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { isMultiSelectActive } from '@/content/page-translate-v2/multi-select';
import { cancelPageTranslateV2 } from '@/content/page-translate-v2';

// The content script's own wiring with the real pill: no ProgressHandle double between them.

const WORKER = { id: 'ega-test' } as chrome.runtime.MessageSender;
const ORIGINALS = ['これは最初の段落です。', '二つ目の段落です。', '三つ目の段落です。'];

function emit(msg: unknown): void {
  chromeMock.runtime.onMessage.emit(msg, WORKER, () => {});
}

function chunk(c: TranslationChunk): void {
  emit({ kind: 'translate:chunk', chunk: c });
}

function finish(requestId: string, translation: string): void {
  chunk({ type: 'delta', requestId, text: translation });
  chunk({ type: 'done', requestId, confidence: 1 });
}

function sent(kind: string): { requestId: string; text?: string }[] {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as { kind?: string; requestId: string; text?: string })
    .filter((m) => m.kind === kind);
}

function pill(selector: string): HTMLElement | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  return root?.querySelector<HTMLElement>(`[data-ega-batch-progress] ${selector}`) ?? null;
}

function text(id: string): string {
  return document.getElementById(id)?.textContent ?? '';
}

async function until(cond: () => boolean, what: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!cond()) throw new Error(`timed out waiting for ${what}`);
    },
    { timeout: 3000 },
  );
}

/** Opens translate-areas from the worker message, picks every paragraph and sends them. */
async function translateAll(): Promise<string[]> {
  emit({ kind: 'page:chooseAreas' });
  await until(() => isMultiSelectActive(), 'translate-areas mode');
  for (const id of ['a', 'b', 'c']) {
    document.getElementById(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await until(() => sent('translate:start').length === 3, 'three translate:start');
  await until(() => pill('[data-ega-batch-cancel]') !== null, 'the progress pill');
  return sent('translate:start').map((m) => m.requestId);
}

// The first import transforms the whole content script; on a loaded box that alone outlasts a test's 5 s.
beforeAll(async () => {
  (chrome.runtime as { id?: string }).id = 'ega-test';
  await import('@/content/index');
}, 60_000);

beforeEach(async () => {
  resetSettingsCacheForTest();
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: {
      ...DEFAULT_SETTINGS,
      pageTranslateMode: 'inplace',
      batchConcurrency: 3,
    },
  });
  (chromeMock.runtime.sendMessage as Mock).mockClear();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  document.body.innerHTML = ORIGINALS.map((t, i) => `<p id="${'abc'[i] ?? ''}">${t}</p>`).join('');
});

afterEach(async () => {
  await cancelPageTranslateV2();
  document.body.innerHTML = '';
});

function pillButton(name: string): HTMLButtonElement | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  const all = [
    ...(root?.querySelectorAll<HTMLButtonElement>('[data-ega-batch-progress] button') ?? []),
  ];
  return all.find((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name) ?? null;
}

describe('page translate through the content script and the real pill', () => {
  it('Stop lets the areas in flight finish, then says how many were kept', async () => {
    const [first, second, third] = await translateAll();
    finish(first ?? '', 'First paragraph.');
    await until(() => text('a') === 'First paragraph.', 'the first block');

    pill('[data-ega-batch-cancel]')?.click();
    expect(sent('translate:cancel')).toEqual([]);
    finish(second ?? '', 'Second.');
    finish(third ?? '', 'Third.');

    await until(
      () => pill('[data-ega-batch-label]')?.textContent === 'Page translated to English',
      'the settled pill',
    );
    expect(pill('[data-ega-batch-cancel]')).toBeNull();
    expect([text('a'), text('b'), text('c')]).toEqual(['First paragraph.', 'Second.', 'Third.']);
  });

  it('Remove translation puts every area back and takes the pill away', async () => {
    const [first, second, third] = await translateAll();
    for (const id of [first, second, third]) finish(id ?? '', 'Done.');
    await until(() => pillButton('More') !== null, 'the settled pill');

    pillButton('More')?.click();
    await until(() => pill('[data-ega-batch-remove]') !== null, 'the More menu');
    pill('[data-ega-batch-remove]')?.click();

    await until(() => pill('[data-ega-batch-label]') === null, 'the pill to go');
    expect([text('a'), text('b'), text('c')]).toEqual(ORIGINALS);
  });

  it('Try again sends the failed area again', async () => {
    const [first, second, third] = await translateAll();
    finish(first ?? '', 'One.');
    finish(third ?? '', 'Three.');
    chunk({ type: 'error', requestId: second ?? '', code: 'UNKNOWN', message: 'bad key' });
    await until(() => pillButton('Try again, 1 failed area') !== null, 'Try again');
    expect(pill('[data-ega-batch-label]')?.textContent).toBe(
      "Couldn't translate 1 of 3 areas. Ega could not finish this translation.",
    );
    const before = sent('translate:start').length;

    pillButton('Try again, 1 failed area')?.click();

    await until(() => sent('translate:start').length === before + 1, 'the retry send');
    expect(sent('translate:start').at(-1)?.text).toBe(ORIGINALS[1]);
    await until(
      () => pill('[data-ega-batch-label]')?.textContent === 'Translating 2 of 3 areas…',
      'the running pill',
    );
  });
});

describe('Translate page from the popup or the right-click menu', () => {
  it('translates the whole page, without asking the user to pick areas', async () => {
    // Every block is in view: the observer reports each one near as soon as it is watched.
    class InView {
      constructor(private readonly cb: IntersectionObserverCallback) {}
      observe(target: Element): void {
        this.cb(
          [{ target, isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('IntersectionObserver', InView);
    try {
      emit({ kind: 'page:translateAll' });
      await until(() => sent('translate:start').length === 3, 'three translate:start');
      expect(isMultiSelectActive()).toBe(false);
      expect(sent('translate:start').map((m) => m.text)).toEqual(ORIGINALS);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
