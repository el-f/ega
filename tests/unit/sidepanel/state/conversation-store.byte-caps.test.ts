// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  MAX_THREAD_BYTES,
  MAX_TURN_BYTES,
  loadThreadResult,
  saveThread,
  threadKey,
} from '@/sidepanel/state/conversation-store';
import type { Turn, UserTurnData } from '@/sidepanel/state/conversation';

const ORIGIN = 'https://caps.example';

function userTurn(id: string, over: Partial<UserTurnData> = {}): UserTurnData {
  return {
    id,
    role: 'user',
    kind: 'translate',
    status: 'idle',
    createdAt: 1,
    content: id,
    ...over,
  };
}

function imageTurn(id: string, urlChars: number): Turn {
  return userTurn(id, {
    kind: 'image-translate',
    content: `text for ${id}`,
    imageDataUrl: 'd'.repeat(urlChars),
  });
}

async function roundTrip(turns: Turn[]): Promise<Turn[]> {
  await chrome.storage.local.remove(threadKey(ORIGIN));
  await saveThread(ORIGIN, turns);
  return (await loadThreadResult(ORIGIN)).turns;
}

describe('the per-image cap', () => {
  it('leaves room inside the turn cap, or every case below fails for the wrong reason', () => {
    expect(MAX_IMAGE_BYTES).toBeLessThan(MAX_TURN_BYTES);
  });

  it('keeps an image of exactly the cap', async () => {
    const [turn] = await roundTrip([imageTurn('i', MAX_IMAGE_BYTES)]);

    expect(turn?.imageDataUrl).toHaveLength(MAX_IMAGE_BYTES);
    expect(turn?.content).toBe('text for i');
  });

  it('drops the one character past it and says why', async () => {
    const [turn] = await roundTrip([imageTurn('i', MAX_IMAGE_BYTES + 1)]);

    expect(turn?.imageDataUrl).toBeUndefined();
    expect(turn?.content).toBe('text for i');
  });

  it('leaves the note as the content when the turn had no text of its own', async () => {
    const bare = userTurn('i', {
      kind: 'image-translate',
      content: '',
      imageDataUrl: 'd'.repeat(MAX_IMAGE_BYTES + 1),
    });

    const [turn] = await roundTrip([bare]);

    expect(turn?.content).toBe('[image removed: too large to store]');
  });
});

describe('the per-turn cap', () => {
  it('keeps a turn that fits whole', async () => {
    const content = 'x'.repeat(MAX_TURN_BYTES - 500);
    const [turn] = await roundTrip([userTurn('t', { content })]);

    expect(turn?.content).toBe(content);
  });

  it('shrinks a turn past the cap instead of dropping it', async () => {
    const content = 'x'.repeat(MAX_TURN_BYTES + 1000);
    const [turn] = await roundTrip([userTurn('t', { content })]);

    expect(turn).toBeDefined();
    expect(turn?.id).toBe('t');
    expect((turn?.content ?? '').length).toBeLessThan(content.length);
  });
});

describe('the whole-thread cap', () => {
  it('keeps the newest turns and drops the oldest', async () => {
    const big = 'y'.repeat(60_000);
    const turns = Array.from({ length: 20 }, (_, i) =>
      userTurn(`t${String(i).padStart(2, '0')}`, { content: big, createdAt: i + 1 }),
    );

    const out = await roundTrip(turns);

    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(turns.length);
    // The survivors are a suffix: the newest ids, in order, with nothing from the front.
    const ids = out.map((t) => t.id);
    expect(ids).toEqual(turns.slice(turns.length - ids.length).map((t) => t.id));
    expect(ids).toContain('t19');
    expect(ids).not.toContain('t00');
  });

  it('reports the turns it dropped, so the panel can drop them too', async () => {
    await chrome.storage.local.remove(threadKey(ORIGIN));
    const big = 'y'.repeat(60_000);
    const turns = Array.from({ length: 20 }, (_, i) =>
      userTurn(`t${String(i).padStart(2, '0')}`, { content: big, createdAt: i + 1 }),
    );

    const { droppedIds } = await saveThread(ORIGIN, turns);
    const kept = new Set((await loadThreadResult(ORIGIN)).turns.map((t) => t.id));

    expect(kept.size).toBeLessThan(turns.length);
    expect(droppedIds).toEqual(turns.filter((t) => !kept.has(t.id)).map((t) => t.id));
  });

  it('keeps a thread that sits under the budget whole', async () => {
    const turns = Array.from({ length: 5 }, (_, i) =>
      userTurn(`t${String(i)}`, { content: 'z'.repeat(1000), createdAt: i + 1 }),
    );

    const out = await roundTrip(turns);

    expect(out.map((t) => t.id)).toEqual(['t0', 't1', 't2', 't3', 't4']);
  });

  it('drops the oldest image before any text answer', async () => {
    await chrome.storage.local.remove(threadKey(ORIGIN));
    const answer = (id: string, of: string, content: string): Turn => ({
      id,
      role: 'assistant',
      kind: 'image-translate',
      status: 'done',
      createdAt: 1,
      content,
      attachedToTurnId: of,
    });
    const turns = [1, 2, 3].flatMap((n) => [
      imageTurn(`u${n}`, 250_000),
      answer(`a${n}`, `u${n}`, `answer ${n}`),
    ]);

    const { droppedIds } = await saveThread(ORIGIN, turns);
    const out = (await loadThreadResult(ORIGIN)).turns;

    expect(droppedIds).toBeUndefined();
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3', 'a3']);
    expect(out[1]?.content).toBe('answer 1');
    expect(out[0]).toMatchObject({ content: 'text for u1', imageShed: true });
    expect(out[0]?.imageDataUrl).toBeUndefined();
    expect(out[2]?.imageDataUrl).toHaveLength(250_000);
    expect(out[4]?.imageDataUrl).toHaveLength(250_000);
  });

  it('never stores more than the thread budget', async () => {
    const big = 'y'.repeat(60_000);
    const turns = Array.from({ length: 20 }, (_, i) =>
      userTurn(`t${String(i)}`, { content: big, createdAt: i + 1 }),
    );

    await roundTrip(turns);

    const stored = (await chrome.storage.local.get(threadKey(ORIGIN)))[threadKey(ORIGIN)] as {
      turns: Turn[];
    };
    expect(JSON.stringify(stored.turns).length).toBeLessThanOrEqual(MAX_THREAD_BYTES);
  });
});
