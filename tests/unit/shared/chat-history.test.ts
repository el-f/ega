import { describe, it, expect } from 'vitest';
import {
  assemblePromptHistory,
  chatContextLabel,
  estimateTokens,
  type ChatTurn,
  type ConversationTurnLike,
} from '@/shared/chat-history';

function u(content: string): ConversationTurnLike {
  return { role: 'user', status: 'idle', content };
}
function a(content: string, status = 'done'): ConversationTurnLike {
  return { role: 'assistant', status, content };
}

describe('estimateTokens', () => {
  it('approximates ~chars/4, min 1 for non-empty', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });
});

describe('assemblePromptHistory', () => {
  it('maps completed user/assistant turns to ChatTurn[], oldest-first', () => {
    const turns: ConversationTurnLike[] = [u('hola'), a('hello'), u('gracias'), a('thanks')];
    const h = assemblePromptHistory(turns, { budgetTokens: 1000 });
    expect(h).toEqual<ChatTurn[]>([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'gracias' },
      { role: 'assistant', content: 'thanks' },
    ]);
  });

  it('excludes an unfinished exchange whole, question included', () => {
    // Counting the question of an in-flight exchange made the "Using N earlier messages" label
    // flicker 1 → hidden → 2 while the answer streamed.
    const turns: ConversationTurnLike[] = [u('hi'), a('', 'pending'), u('bye'), a('err', 'error')];
    const h = assemblePromptHistory(turns, { budgetTokens: 1000 });
    expect(h).toEqual<ChatTurn[]>([]);
  });

  it('image user turns become a text marker, not dropped', () => {
    const img: ConversationTurnLike = { role: 'user', status: 'idle', content: '[image]' };
    const turns: ConversationTurnLike[] = [img, a('sign text', 'done')];
    const h = assemblePromptHistory(turns, { budgetTokens: 1000 });
    expect(h[0]).toEqual({ role: 'user', content: '[image]' });
    expect(h[1]).toEqual({ role: 'assistant', content: 'sign text' });
  });

  it('tail-trims by token budget, keeping the most recent turns', () => {
    const big = 'x'.repeat(400); // ~100 tokens each
    const turns: ConversationTurnLike[] = [u(big), a(big), u('recent-q'), a('recent-a')];
    const h = assemblePromptHistory(turns, { budgetTokens: 50 });
    // budget 50 tok keeps only the small recent pair
    expect(h).toEqual<ChatTurn[]>([
      { role: 'user', content: 'recent-q' },
      { role: 'assistant', content: 'recent-a' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(assemblePromptHistory([], { budgetTokens: 1000 })).toEqual([]);
  });

  it('drops a leading assistant turn orphaned by the budget trim', () => {
    const big = 'x'.repeat(400); // ~100 tokens
    const small = 'ok';
    // u1(~100tok) a1(~1tok) u2(~1tok) a2(~1tok)
    // budget=5 fits a1+u2+a2 but not u1 → slice starts at a1 (assistant) → must be dropped
    const turns: ConversationTurnLike[] = [u(big), a(small), u(small), a(small)];
    const h = assemblePromptHistory(turns, { budgetTokens: 5 });
    expect(h[0]?.role).toBe('user');
  });
});

describe('chatContextLabel', () => {
  it('returns null for empty turns', () => {
    expect(chatContextLabel([], { budgetTokens: 1000 })).toBeNull();
  });

  it('returns null when no assembled messages (pending assistant with partial content excludes the user turn)', () => {
    // User turn is excluded because its next sibling is a non-done assistant
    // with non-empty partial content (a streaming partial answer).
    const turns: ConversationTurnLike[] = [u('hi'), a('partial...', 'pending')];
    expect(chatContextLabel(turns, { budgetTokens: 1000 })).toBeNull();
  });

  it('returns "Using 2 earlier messages" for one completed exchange', () => {
    const turns: ConversationTurnLike[] = [u('hola'), a('hello')];
    expect(chatContextLabel(turns, { budgetTokens: 1000 })).toBe('Using 2 earlier messages');
  });

  it('returns "Using 4 earlier messages" for two completed exchanges', () => {
    const turns: ConversationTurnLike[] = [u('hola'), a('hello'), u('gracias'), a('thanks')];
    expect(chatContextLabel(turns, { budgetTokens: 1000 })).toBe('Using 4 earlier messages');
  });

  it('uses singular "message" when assembled count is 1', () => {
    const turns: ConversationTurnLike[] = [u('solo')];
    expect(chatContextLabel(turns, { budgetTokens: 1000 })).toBe('Using 1 earlier message');
  });

  it('label reads as plain language, distinct from the page-context control', () => {
    const turns: ConversationTurnLike[] = [u('hola'), a('hello')];
    const label = chatContextLabel(turns, { budgetTokens: 1000 });
    expect(label).not.toContain('context');
    expect(label).toMatch(/^Using /);
  });

  it('reflects token-budget trim in the label', () => {
    const big = 'x'.repeat(400); // ~100 tokens each
    const turns: ConversationTurnLike[] = [u(big), a(big), u('recent-q'), a('recent-a')];
    // budget=50 keeps only recent pair → 2 messages
    expect(chatContextLabel(turns, { budgetTokens: 50 })).toBe('Using 2 earlier messages');
  });
});
