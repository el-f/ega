import { describe, it, expect } from 'vitest';
import { visibleTurns, type Turn } from '@/sidepanel/state/conversation';

const u = (id: string, bookmarked?: boolean): Turn => ({
  createdAt: 1,
  id,
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content: 'text',
  ...(bookmarked !== undefined ? { bookmarked } : {}),
});
const a = (id: string, attachedToTurnId: string, bookmarked?: boolean): Turn => ({
  createdAt: 1,
  id,
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content: 'result',
  attachedToTurnId,
  ...(bookmarked !== undefined ? { bookmarked } : {}),
});

describe('visibleTurns', () => {
  it('returns all turns when bookmarkedOnly is false', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1'), u('u2'), a('a2', 'u2')];
    const out = visibleTurns(turns, false);
    expect(out).toHaveLength(4);
  });

  it('returns same reference when bookmarkedOnly is false', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1')];
    expect(visibleTurns(turns, false)).toBe(turns);
  });

  it('returns empty list when filter on and no bookmarks', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1'), u('u2'), a('a2', 'u2')];
    const out = visibleTurns(turns, true);
    expect(out).toHaveLength(0);
  });

  it('includes bookmarked user turn and its assistant pair', () => {
    const turns: Turn[] = [u('u1', true), a('a1', 'u1'), u('u2'), a('a2', 'u2')];
    const out = visibleTurns(turns, true);
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('includes bookmarked assistant turn and its parent user turn', () => {
    const turns: Turn[] = [u('u1'), a('a1', 'u1', true), u('u2'), a('a2', 'u2')];
    const out = visibleTurns(turns, true);
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('includes both pairs when multiple exchanges are bookmarked', () => {
    const turns: Turn[] = [
      u('u1', true),
      a('a1', 'u1'),
      u('u2'),
      a('a2', 'u2'),
      u('u3'),
      a('a3', 'u3', true),
    ];
    const out = visibleTurns(turns, true);
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1', 'u3', 'a3']);
  });

  it('does not duplicate turns when both user and assistant are bookmarked', () => {
    const turns: Turn[] = [u('u1', true), a('a1', 'u1', true)];
    const out = visibleTurns(turns, true);
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('does not mutate the input array', () => {
    const turns: Turn[] = [u('u1', true), a('a1', 'u1'), u('u2'), a('a2', 'u2')];
    const copy = [...turns];
    visibleTurns(turns, true);
    expect(turns).toEqual(copy);
  });
});
