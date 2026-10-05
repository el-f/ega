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
  chunk({ type: 'delta', requestId, text: JSON.stringify({ translation }) });
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
  emit({ kind: 'page:translateAll' });
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

describe('page translate through the content script and the real pill', () => {
  it('Stop keeps the finished area, cancels the rest and says so on the pill', async () => {
    const [first, second, third] = await translateAll();
    finish(first ?? '', 'First paragraph.');
    await until(() => text('a') === 'First paragraph.', 'the first block');

    pill('[data-ega-batch-cancel]')?.click();

    expect(pill('[data-ega-batch-label]')?.textContent).toBe('Stopped · 1 of 3 areas translated');
    expect(pill('[data-ega-batch-cancel]')?.textContent).toBe('Show original');
    const canceled = sent('translate:cancel').map((m) => m.requestId);
    expect(canceled).toEqual(expect.arrayContaining([second, third]));
    expect(canceled).not.toContain(first);
    expect([text('a'), text('b'), text('c')]).toEqual([
      'First paragraph.',
      ORIGINALS[1],
      ORIGINALS[2],
    ]);
  });

  it('Undo all puts every area back and takes the pill away', async () => {
    const [first] = await translateAll();
    finish(first ?? '', 'First paragraph.');
    await until(() => text('a') === 'First paragraph.', 'the first block');

    pill('.undo')?.click();

    await until(() => pill('.undo') === null, 'the pill to go');
    expect([text('a'), text('b'), text('c')]).toEqual(ORIGINALS);
  });

  it('Retry failed sends the failed area again', async () => {
    const [first, second, third] = await translateAll();
    finish(first ?? '', 'One.');
    finish(third ?? '', 'Three.');
    chunk({ type: 'error', requestId: second ?? '', code: 'AUTH', message: 'bad key' });
    await until(() => pill('.retry-failed')?.hidden === false, 'Retry failed');
    const before = sent('translate:start').length;

    pill('.retry-failed')?.click();

    await until(() => sent('translate:start').length === before + 1, 'the retry send');
    expect(sent('translate:start').at(-1)?.text).toBe(ORIGINALS[1]);
    expect(pill('[data-ega-batch-label]')?.textContent).toBe('Translating 2 of 3 areas…');
  });
});
