import { describe, expect, it, beforeEach } from 'vitest';
import { MAX_SELECTION_CHARS } from '@/shared/constants';
import {
  drainPendingPopupHandoff,
  MAX_HANDOFF_AGE_MS,
  PENDING_POPUP_HANDOFF_KEY,
  writePendingPopupHandoff,
} from '@/shared/pending-popup-handoff';
import { IMAGE_DATA_URL_MAX_CHARS } from '@/shared/constants';

describe('pending-popup-handoff', () => {
  beforeEach(async () => {
    await chrome.storage.session.remove(PENDING_POPUP_HANDOFF_KEY);
  });

  it('drain returns empty list when nothing queued', async () => {
    const out = await drainPendingPopupHandoff();
    expect(out).toEqual([]);
  });

  it('write then drain returns the payload + clears the slot', async () => {
    await writePendingPopupHandoff({
      sourceText: 'hello world',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(1);
    expect(out[0]?.sourceText).toBe('hello world');
    expect(out[0]?.task).toBe('translate');
    expect(out[0]?.tone).toBe('neutral');
    const drainedAgain = await drainPendingPopupHandoff();
    expect(drainedAgain).toEqual([]);
  });

  it('two writes both land — drain returns both in insertion order', async () => {
    await writePendingPopupHandoff({
      sourceText: 'first',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });
    await writePendingPopupHandoff({
      sourceText: 'second',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(2);
    expect(out[0]?.sourceText).toBe('first');
    expect(out[1]?.sourceText).toBe('second');
  });

  it('drains a same-ms 9→10 burst in insertion order', async () => {
    // Same-ms keys: a string sort put -10 before -9; the key prefix sets order, the ts field sets age.
    const keyTs = 1_720_000_000_000; // fixed prefix for the two keys
    const fresh = Date.now();
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        [`${keyTs}-9`]: {
          sourceText: 'ninth',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
          ts: fresh,
        },
        [`${keyTs}-10`]: {
          sourceText: 'tenth',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
          ts: fresh,
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(2);
    expect(out[0]?.sourceText).toBe('ninth');
    expect(out[1]?.sourceText).toBe('tenth');
  });

  it('concurrent writes serialize — none lost', async () => {
    await Promise.all([
      writePendingPopupHandoff({
        sourceText: 'a',
        sourceLang: 'auto',
        targetLang: 'en',
        task: 'translate',
        tone: 'neutral',
      }),
      writePendingPopupHandoff({
        sourceText: 'b',
        sourceLang: 'auto',
        targetLang: 'en',
        task: 'translate',
        tone: 'neutral',
      }),
      writePendingPopupHandoff({
        sourceText: 'c',
        sourceLang: 'auto',
        targetLang: 'en',
        task: 'translate',
        tone: 'neutral',
      }),
    ]);
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(3);
    expect(out.map((h) => h.sourceText).sort()).toEqual(['a', 'b', 'c']);
  });

  it('an entry without ts is dropped on drain', async () => {
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'no-ts': {
          sourceText: 'no timestamp',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out).toEqual([]);
  });

  it('rejects malformed payload via decode and returns empty', async () => {
    await chrome.storage.session.set({ [PENDING_POPUP_HANDOFF_KEY]: { sourceText: 42 } });
    const out = await drainPendingPopupHandoff();
    expect(out).toEqual([]);
  });

  it('drain leaves slot untouched when nothing was queued', async () => {
    await drainPendingPopupHandoff();
    const stored = await chrome.storage.session.get(PENDING_POPUP_HANDOFF_KEY);
    expect(stored[PENDING_POPUP_HANDOFF_KEY]).toBeUndefined();
  });

  it('drops entries older than MAX_HANDOFF_AGE_MS via wall-clock gate', async () => {
    // A payload past the staleness window must not replay into a reopened panel.
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'planted-stale': {
          sourceText: 'stale',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
          ts: Date.now() - (MAX_HANDOFF_AGE_MS + 30_000),
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out).toEqual([]);
  });

  it('keeps entries inside MAX_HANDOFF_AGE_MS — fresh writes land', async () => {
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'planted-fresh': {
          sourceText: 'fresh',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
          ts: Date.now() - 30_000,
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(1);
    expect(out[0]?.sourceText).toBe('fresh');
  });

  it('write stamps ts so the next drain sees a wall-clock timestamp', async () => {
    const before = Date.now();
    await writePendingPopupHandoff({
      sourceText: 'stamped',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(1);
    expect(out[0]?.ts).toBeGreaterThanOrEqual(before);
    expect(out[0]?.ts).toBeLessThanOrEqual(Date.now());
  });

  it('drain keeps an entry whose task id no task has; the panel runs it as Translate', async () => {
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'gone-1': {
          sourceText: 'hello',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'NotARealTask',
          tone: 'neutral',
          ts: Date.now(),
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out.map((h) => [h.sourceText, h.task])).toEqual([['hello', 'NotARealTask']]);
  });

  it('drain drops an entry whose task is not an id', async () => {
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'forged-1': {
          sourceText: 'hello',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'not a task!',
          tone: 'neutral',
          ts: Date.now(),
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out).toEqual([]);
  });

  it('drain drops an entry with an unknown tone value', async () => {
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'forged-1': {
          sourceText: 'hello',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'sarcasticInternetTroll',
          ts: Date.now(),
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out).toEqual([]);
  });

  it('drain clamps oversize sourceText and flags it (never drops the message)', async () => {
    const huge = 'x'.repeat(2001);
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'forged-1': {
          sourceText: huge,
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
          ts: Date.now(),
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out).toHaveLength(1);
    expect(out[0]?.sourceText).toHaveLength(MAX_SELECTION_CHARS);
    expect(out[0]?.trimmed).toBe(true);
  });

  it('forwards optional response / imageDataUrl / ocrText through write+drain', async () => {
    await writePendingPopupHandoff({
      sourceText: 'bonjour',
      sourceLang: 'fr',
      targetLang: 'en',
      task: 'explain',
      tone: 'neutral',
      response: 'A French greeting.',
      imageDataUrl: 'data:image/png;base64,AAAA',
      ocrText: 'bonjour',
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(1);
    expect(out[0]?.response).toBe('A French greeting.');
    expect(out[0]?.imageDataUrl).toBe('data:image/png;base64,AAAA');
    expect(out[0]?.ocrText).toBe('bonjour');
  });

  it('decodes a handoff with the optional fields absent (back-compat)', async () => {
    await writePendingPopupHandoff({
      sourceText: 'hola',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(1);
    expect(out[0]?.response).toBeUndefined();
    expect(out[0]?.imageDataUrl).toBeUndefined();
    expect(out[0]?.ocrText).toBeUndefined();
  });

  it('drops non-string optional fields rather than carrying garbage', async () => {
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'forged-1': {
          sourceText: 'hi',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
          ts: Date.now(),
          response: 42,
          imageDataUrl: { not: 'a string' },
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(1);
    expect(out[0]?.response).toBeUndefined();
    expect(out[0]?.imageDataUrl).toBeUndefined();
  });

  it('drops an over-cap optional field (storage flood guard)', async () => {
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        'flood-1': {
          sourceText: 'hi',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
          ts: Date.now(),
          response: 'x'.repeat(50_001),
          ocrText: 'kept',
        },
      },
    });
    const out = await drainPendingPopupHandoff();
    expect(out.length).toBe(1);
    expect(out[0]?.response).toBeUndefined();
    expect(out[0]?.ocrText).toBe('kept');
  });
});

describe('pending-popup-handoff — a send is answered by its own window', () => {
  beforeEach(async () => {
    await chrome.storage.session.remove(PENDING_POPUP_HANDOFF_KEY);
  });

  const base = {
    sourceLang: 'auto',
    targetLang: 'en',
    task: 'translate' as const,
    tone: 'neutral' as const,
  };

  it('leaves the other window its own entry', async () => {
    await writePendingPopupHandoff({ ...base, sourceText: 'from one', windowId: 1 });
    await writePendingPopupHandoff({ ...base, sourceText: 'from two', windowId: 2 });

    const mine = await drainPendingPopupHandoff(1);
    expect(mine.map((h) => h.sourceText)).toEqual(['from one']);

    const theirs = await drainPendingPopupHandoff(2);
    expect(theirs.map((h) => h.sourceText)).toEqual(['from two']);

    expect(await drainPendingPopupHandoff(2)).toEqual([]);
  });

  it('writes nothing back when every entry belongs to another window', async () => {
    await writePendingPopupHandoff({ ...base, sourceText: 'from one', windowId: 1 });
    const before = await chrome.storage.session.get(PENDING_POPUP_HANDOFF_KEY);

    expect(await drainPendingPopupHandoff(3)).toEqual([]);

    const after = await chrome.storage.session.get(PENDING_POPUP_HANDOFF_KEY);
    expect(after).toEqual(before);
  });

  it('an entry with no window still drains to whoever asks', async () => {
    await writePendingPopupHandoff({ ...base, sourceText: 'legacy' });
    expect((await drainPendingPopupHandoff(9)).map((h) => h.sourceText)).toEqual(['legacy']);
  });

  it('drains everything when the caller has no window id', async () => {
    await writePendingPopupHandoff({ ...base, sourceText: 'a', windowId: 1 });
    await writePendingPopupHandoff({ ...base, sourceText: 'b', windowId: 2 });
    expect((await drainPendingPopupHandoff()).map((h) => h.sourceText)).toEqual(['a', 'b']);
  });

  it('drops a non-numeric windowId instead of the whole entry', async () => {
    await chrome.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        k1: { ...base, sourceText: 'bad id', ts: Date.now(), windowId: '1' },
      },
    });
    const out = await drainPendingPopupHandoff(1);
    expect(out.length).toBe(1);
    expect(out[0]?.windowId).toBeUndefined();
  });
});

describe('image size', () => {
  it('keeps an image up to the store cap and flags a larger one as dropped instead of losing it silently', async () => {
    await writePendingPopupHandoff({
      sourceText: 'keep',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      imageDataUrl: `data:image/png;base64,${'A'.repeat(200_000)}`,
    });
    await writePendingPopupHandoff({
      sourceText: 'drop',
      sourceLang: 'auto',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
      imageDataUrl: `data:image/png;base64,${'A'.repeat(IMAGE_DATA_URL_MAX_CHARS + 1)}`,
    });
    const out = await drainPendingPopupHandoff();
    const kept = out.find((h) => h.sourceText === 'keep');
    const dropped = out.find((h) => h.sourceText === 'drop');
    expect(kept?.imageDataUrl?.length).toBeGreaterThan(200_000);
    expect(kept?.imageDropped).toBeUndefined();
    expect(dropped?.imageDataUrl).toBeUndefined();
    expect(dropped?.imageDropped).toBe(true);
  });
});
