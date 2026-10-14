import { describe, it, expect } from 'vitest';
import {
  deleteTurnPair,
  truncateFrom,
  toggleBookmark,
  type Turn,
} from '@/sidepanel/state/conversation';

const u = (id: string, content = 'text'): Turn => ({
  createdAt: 1,
  id,
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content,
});
const a = (id: string, attachedToTurnId: string, content = 'result'): Turn => ({
  createdAt: 1,
  id,
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content,
  attachedToTurnId,
});

describe('deleteTurnPair', () => {
  it('deletes a user turn and its assistant(s)', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1'), u('u2'), a('a2', 'u2')];
    const out = deleteTurnPair(turns, 'u1');
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.id)).toEqual(['u2', 'a2']);
  });

  it('deletes an assistant turn and its parent user turn', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1'), u('u2'), a('a2', 'u2')];
    const out = deleteTurnPair(turns, 'a1');
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.id)).toEqual(['u2', 'a2']);
  });

  it('deletes all assistant turns attached to the same user turn', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1'), a('a2', 'u1')];
    const out = deleteTurnPair(turns, 'u1');
    expect(out).toHaveLength(0);
  });

  it('is a no-op (returns copy) for unknown id', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1')];
    const out = deleteTurnPair(turns, 'missing');
    expect(out).not.toBe(turns);
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('does not mutate the input array', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1')];
    const copy = [...turns];
    deleteTurnPair(turns, 'u1');
    expect(turns).toEqual(copy);
  });
});

describe('truncateFrom', () => {
  it('drops the target turn and everything after it', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1'), u('u2'), a('a2', 'u2')];
    const out = truncateFrom(turns, 'u2');
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('truncating the first turn returns empty', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1')];
    const out = truncateFrom(turns, 'u1');
    expect(out).toHaveLength(0);
  });

  it('is a no-op (returns copy) for unknown id', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1')];
    const out = truncateFrom(turns, 'missing');
    expect(out).not.toBe(turns);
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('does not mutate the input array', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1'), u('u2')];
    const copy = [...turns];
    truncateFrom(turns, 'u2');
    expect(turns).toEqual(copy);
  });
});

describe('toggleBookmark', () => {
  it('sets bookmarked to true on an unbookmarked turn', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1')];
    const out = toggleBookmark(turns, 'u1');
    expect(out.find((t) => t.id === 'u1')?.bookmarked).toBe(true);
    expect(out.find((t) => t.id === 'a1')?.bookmarked).toBeUndefined();
  });

  it('clears bookmarked when already true', () => {
    const turns: Turn[] = [{ ...u('u1'), bookmarked: true }, a('a1', 'u1')];
    const out = toggleBookmark(turns, 'u1');
    expect(out.find((t) => t.id === 'u1')?.bookmarked).toBe(false);
  });

  it('is a no-op (returns copy) for unknown id', () => {
    const turns: Turn[] = [u('u1')];
    const out = toggleBookmark(turns, 'missing');
    expect(out).not.toBe(turns);
    expect(out.map((t) => t.id)).toEqual(['u1']);
  });

  it('returns a new array (immutable)', () => {
    const turns: Turn[] = [u('u1')];
    const out = toggleBookmark(turns, 'u1');
    expect(out).not.toBe(turns);
    expect(out[0]).not.toBe(turns[0]);
  });

  it('does not mutate other turns', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1'), u('u2')];
    const a1Before = turns[1];
    const out = toggleBookmark(turns, 'u1');
    expect(out[1]).toBe(a1Before);
  });
});
