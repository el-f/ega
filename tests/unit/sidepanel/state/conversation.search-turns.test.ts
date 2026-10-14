import { describe, it, expect } from 'vitest';
import { searchTurns, type Turn } from '@/sidepanel/state/conversation';

const u = (id: string, content: string): Turn => ({
  createdAt: 1,
  id,
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content,
});
const a = (id: string, attachedToTurnId: string, content: string): Turn => ({
  createdAt: 1,
  id,
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content,
  attachedToTurnId,
});

describe('searchTurns', () => {
  it('returns all turns unchanged for empty query', () => {
    const turns: Turn[] = [u('u1', 'hello'), a('a1', 'u1', 'world')];
    expect(searchTurns(turns, '')).toBe(turns);
  });

  it('returns all turns unchanged for whitespace-only query', () => {
    const turns: Turn[] = [u('u1', 'hello'), a('a1', 'u1', 'world')];
    expect(searchTurns(turns, '   ')).toBe(turns);
  });

  it('returns empty array when nothing matches', () => {
    const turns: Turn[] = [u('u1', 'hello'), a('a1', 'u1', 'world')];
    const out = searchTurns(turns, 'zzznomatch');
    expect(out).toHaveLength(0);
  });

  it('keeps both turns of an exchange when user content matches', () => {
    const turns: Turn[] = [
      u('u1', 'hello world'),
      a('a1', 'u1', 'bonjour'),
      u('u2', 'goodbye'),
      a('a2', 'u2', 'au revoir'),
    ];
    const out = searchTurns(turns, 'hello');
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('keeps both turns of an exchange when assistant content matches', () => {
    const turns: Turn[] = [
      u('u1', 'hello world'),
      a('a1', 'u1', 'bonjour'),
      u('u2', 'goodbye'),
      a('a2', 'u2', 'au revoir'),
    ];
    const out = searchTurns(turns, 'revoir');
    expect(out.map((t) => t.id)).toEqual(['u2', 'a2']);
  });

  it('keeps multiple matching exchanges', () => {
    const turns: Turn[] = [
      u('u1', 'translate this'),
      a('a1', 'u1', 'translated text'),
      u('u2', 'other thing'),
      a('a2', 'u2', 'something else'),
      u('u3', 'translate again'),
      a('a3', 'u3', 'another translation'),
    ];
    const out = searchTurns(turns, 'translate');
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1', 'u3', 'a3']);
  });

  it('matches case-insensitively', () => {
    const turns: Turn[] = [u('u1', 'Hello World'), a('a1', 'u1', 'bonjour')];
    expect(searchTurns(turns, 'hello')).toHaveLength(2);
    expect(searchTurns(turns, 'HELLO')).toHaveLength(2);
    expect(searchTurns(turns, 'HeLLo')).toHaveLength(2);
  });

  it('keeps exchange when only the assistant side matches', () => {
    const turns: Turn[] = [u('u1', 'xyz'), a('a1', 'u1', 'found it here')];
    const out = searchTurns(turns, 'found');
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('does not mutate the input array', () => {
    const turns: Turn[] = [u('u1', 'hello'), a('a1', 'u1', 'world')];
    const copy = [...turns];
    searchTurns(turns, 'hello');
    expect(turns).toEqual(copy);
  });
});
