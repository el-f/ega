import { describe, it, expect } from 'vitest';
import type { Turn } from '@/sidepanel/state/conversation';

// tsc runs on every commit; each @ts-expect-error fails the build if the shape stops being illegal.
describe('a turn is shaped by its role', () => {
  it('a user turn cannot carry an answer, and an answer cannot carry a send', () => {
    // @ts-expect-error variants belong to an answer
    const user: Turn = {
      id: 'u',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: 'hola',
      createdAt: 1,
      variants: [],
    };
    // @ts-expect-error a user turn never streams
    const streamingUser: Turn = {
      id: 'u2',
      role: 'user',
      kind: 'translate',
      status: 'streaming',
      content: 'hola',
      createdAt: 1,
    };
    const answer: Turn = {
      id: 'a',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      createdAt: 1,
      // @ts-expect-error the dispatch a send replays lives on the user turn
      dispatch: { sourceLang: 'auto', targetLang: 'en', stream: true },
    };
    expect([user, streamingUser, answer].map((t) => t.role)).toEqual(['user', 'user', 'assistant']);
  });
});
