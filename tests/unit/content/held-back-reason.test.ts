// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { drainAsync } from '@tests/_helpers/async';
import type { MsgReply } from '@/shared/messages';
import type { Settings } from '@/shared/types';
// Static so the lazy tooltip import resolves off the warm module graph, not mid-teardown.
import '@/content/tipState.svelte';

await import('@/content/index');

// The popup names why the bubble stayed hidden, from the page's own record of its last decision.

function select(text: string): void {
  document.body.innerHTML = `<p id="p">${text}</p>`;
  const node = document.getElementById('p')?.firstChild;
  if (!node) throw new Error('test setup: text node missing');
  const r = document.createRange();
  r.selectNodeContents(node);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

function ask(): Promise<MsgReply['ega:get-selection']> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'ega:get-selection' },
      { id: chromeMock.runtime.id },
      (r: unknown) => resolve(r as MsgReply['ega:get-selection']),
    );
  });
}

/** Selects, lets the bubble decision run, then drops the live selection the way opening the popup does. */
async function decide(text: string): Promise<void> {
  select(text);
  document.dispatchEvent(new Event('selectionchange'));
  await drainAsync();
}

async function useSettings(patch: Partial<Settings> = {}): Promise<void> {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, ...patch },
  });
  resetSettingsCacheForTest();
}

const ENGLISH = 'the quick brown fox jumps over the lazy dog every morning';

/** The positive control for every absence check below: the English reason was recorded first. */
async function decideEnglish(): Promise<void> {
  await decide(ENGLISH);
  // The English check loads its word list on first use.
  await vi.waitFor(async () => expect((await ask()).heldBack).toEqual({ reason: 'english' }), {
    timeout: 5000,
  });
}

beforeEach(async () => {
  await useSettings();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('the held-back reason the popup reads', () => {
  it('names English text, with the selection still live or already gone', async () => {
    await decideEnglish();
    window.getSelection()?.removeAllRanges();
    expect(await ask()).toEqual({ text: ENGLISH, heldBack: { reason: 'english' } });
  });

  it('names a too-short selection with the length it fell under', async () => {
    await useSettings({ smartBubbleMinLength: 6 });
    await decide('ciao');
    expect((await ask()).heldBack).toEqual({ reason: 'too-short', minLength: 6 });
  });

  it('names the bubble being off in Settings', async () => {
    await useSettings({ bubbleMode: 'never' });
    await decide('שלום עולם');
    expect((await ask()).heldBack).toEqual({ reason: 'mode-never' });
  });

  it('forgets the reason once a later selection shows the bubble', async () => {
    await decideEnglish();
    await decide('שלום עולם מה שלומך');
    expect((await ask()).heldBack).toBeUndefined();
  });

  it('forgets the reason after a minute', async () => {
    await decideEnglish();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_001);
    window.getSelection()?.removeAllRanges();
    expect(await ask()).toEqual({ text: '' });
  });

  // A double-click on Windows keeps the trailing space; a triple-click ends in a newline.
  it.each([
    ['a trailing space', ' '],
    ['a trailing newline', '\n\n'],
  ])('names the reason while the live selection still has %s', async (_, tail) => {
    await decideEnglish();
    select(`${ENGLISH}${tail}`);
    expect(await ask()).toEqual({ text: ENGLISH, heldBack: { reason: 'english' } });
  });

  it('gives no reason while a different selection is live', async () => {
    await decideEnglish();
    select('something else entirely, selected without a decision yet');
    expect((await ask()).heldBack).toBeUndefined();
  });

  it('gives neither text nor reason on a site where Ega is off', async () => {
    await decideEnglish();
    await useSettings({ sitePrefs: { [location.origin]: { disabled: true } } });
    await decide(ENGLISH);
    expect(await ask()).toEqual({ text: '' });
  });
});

describe('Translate anyway from the popup', () => {
  it('anchors on the kept selection after the popup cleared the live one', async () => {
    const { pending } = await import('@/content/request-state');
    await decideEnglish();
    window.getSelection()?.removeAllRanges();
    const rect = {
      left: 30,
      top: 200,
      right: 230,
      bottom: 220,
      width: 200,
      height: 20,
      x: 30,
      y: 200,
    };
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      ...rect,
      toJSON: () => rect,
    } as DOMRect);
    chromeMock.runtime.onMessage.emit(
      { kind: 'ctx:translate-selection', text: ENGLISH },
      { id: chromeMock.runtime.id },
      () => {},
    );
    await vi.waitFor(() => {
      const req = [...pending.values()].find((r) => r.text === ENGLISH);
      expect(req?.rect.top).toBe(200);
      expect(req?.range).toBeDefined();
    });
  });
});
