import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadThreadResult,
  saveThread,
  MAX_THREAD_BYTES,
  MAX_TURN_BYTES,
  MAX_TOTAL_THREAD_BYTES,
  threadKey,
} from '@/sidepanel/state/conversation-store';
import {
  addAssistantTurn,
  addUserTurn,
  applyChunk,
  type Turn,
} from '@/sidepanel/state/conversation';
import { userTurn } from '@tests/_helpers/turns';

function sizeOf(x: unknown): number {
  return JSON.stringify(x).length;
}

afterEach(() => vi.restoreAllMocks());

describe('byte caps', () => {
  it('drops the oldest turns until the thread fits the byte budget', async () => {
    const body = 'x'.repeat(30 * 1024);
    const turns = Array.from({ length: 30 }, (_, i) => userTurn(`t${i}`, `${i}:${body}`));
    await saveThread('https://bytes.com', turns);
    const loaded = (await loadThreadResult('https://bytes.com')).turns;
    expect(sizeOf(loaded)).toBeLessThanOrEqual(MAX_THREAD_BYTES);
    expect(loaded.length).toBeLessThan(turns.length);
    expect(loaded.at(-1)?.id).toBe('t29');
  });

  it('a thread under the budget keeps every turn', async () => {
    const turns = [userTurn('a', 'short'), userTurn('b', 'also short')];
    await saveThread('https://small.com', turns);
    expect((await loadThreadResult('https://small.com')).turns).toEqual(turns);
  });

  it('stores one oversized turn shrunk instead of dropping the thread', async () => {
    const huge: Turn = {
      createdAt: 1,
      id: 'big',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'y'.repeat(400 * 1024),
      rawAcc: 'z'.repeat(400 * 1024),
      attachedToTurnId: 'u1',
    };
    await saveThread('https://huge.com', [huge]);
    const loaded = (await loadThreadResult('https://huge.com')).turns;
    expect(loaded).toHaveLength(1);
    expect(sizeOf(loaded[0])).toBeLessThanOrEqual(MAX_TURN_BYTES);
    expect(loaded[0]?.id).toBe('big');
  });

  it('evicts the oldest thread when all threads together pass the total budget', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1_000));
    const body = 'q'.repeat(250 * 1024);
    const threadCount = Math.ceil(MAX_TOTAL_THREAD_BYTES / (2 * body.length)) + 1;
    for (let i = 0; i < threadCount; i++) {
      await saveThread(`https://g${i}.com`, [userTurn(`a${i}`, body), userTurn(`b${i}`, body)]);
    }
    expect((await loadThreadResult('https://g0.com')).turns).toEqual([]);
    expect((await loadThreadResult(`https://g${threadCount - 1}.com`)).turns).toHaveLength(2);
  });
});

describe('the budget is measured in encoded bytes', () => {
  it('counts a Hebrew thread against the cap at its real size, not its char count', async () => {
    // Each turn is two bytes per character: under the per-turn cap, over the thread cap only when measured right.
    const hebrew = 'א'.repeat(100_000);
    const turns = Array.from({ length: 4 }, (_, i) => userTurn(`h${i}`, hebrew));
    await saveThread('https://heb.com', turns);
    const loaded = (await loadThreadResult('https://heb.com')).turns;
    expect(loaded[0]?.content).toHaveLength(hebrew.length);
    expect(loaded.length).toBeLessThan(turns.length);
  });
});

describe('a settled answer stores its text without the raw model reply', () => {
  it('keeps no rawAcc on a done or failed turn or on its variants', async () => {
    let turns = addUserTurn([], { id: 'u1', kind: 'translate', content: 'hola' });
    turns = addAssistantTurn(turns, { id: 'a1', kind: 'translate', attachedToTurnId: 'u1' });
    turns = addUserTurn(turns, { id: 'u2', kind: 'translate', content: 'adios' });
    turns = addAssistantTurn(turns, { id: 'a2', kind: 'translate', attachedToTurnId: 'u2' });
    applyChunk(turns, 'a1', { type: 'delta', requestId: 'r1', text: '{"translation":"hello"}' });
    applyChunk(turns, 'a1', { type: 'done', requestId: 'r1', confidence: 0.9 });
    applyChunk(turns, 'a2', { type: 'delta', requestId: 'r2', text: '{"translation":"by' });
    applyChunk(turns, 'a2', { type: 'error', requestId: 'r2', code: 'NETWORK', message: 'x' });
    await saveThread('https://raw.com', turns);
    const blob = JSON.stringify(
      (await chrome.storage.local.get(threadKey('https://raw.com')))[threadKey('https://raw.com')],
    );
    expect(blob).toContain('"hello"');
    expect(blob).not.toContain('"rawAcc"');
  });
});

describe('a shrunk assistant turn gets its v1 back on load', () => {
  it('rebuilds variants[0] from the stored body, so Regenerate appends beside it instead of over it', async () => {
    const huge: Turn = {
      createdAt: 1,
      id: 'big',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'y'.repeat(400 * 1024),
      explain: 'why',
      confidence: 0.9,
      attachedToTurnId: 'u',
      variants: [
        {
          id: 'big:v1',
          status: 'done',
          content: 'y'.repeat(400 * 1024),
          rawAcc: '',
          explain: 'why',
        },
      ],
      activeVariantIdx: 0,
    };
    await saveThread('https://shrunk.com', [userTurn('u', 'hi'), huge]);
    const loaded = (await loadThreadResult('https://shrunk.com')).turns;
    const back = loaded.find((t) => t.id === 'big');
    expect(back?.variants).toHaveLength(1);
    expect(back?.variants?.[0]).toMatchObject({
      id: 'big:v1',
      status: 'done',
      explain: 'why',
      confidence: 0.9,
    });
    expect(back?.variants?.[0]?.content).toBe(back?.content);
    expect(back?.activeVariantIdx).toBe(0);
  });
});
