import { describe, it, expect } from 'vitest';
import { addAssistantTurn, addUserTurn } from '@/sidepanel/state/conversation';
import type { PageContext } from '@/shared/types';

const ctx: PageContext = {
  pageUrl: 'https://x.test',
  pageTitle: 'X',
  beforeText: 'foo',
};

describe('addAssistantTurn — contextSent threading', () => {
  it('threads contextSent onto the resulting turn when provided', () => {
    const userTurns = addUserTurn([], { id: 'u1', kind: 'translate', content: 'hi' });
    const out = addAssistantTurn(userTurns, {
      id: 'a1',
      kind: 'translate',
      attachedToTurnId: 'u1',
      contextSent: ctx,
    });
    expect(out[1]?.contextSent).toEqual(ctx);
  });

  it('threads contextSent=null when explicitly passed null', () => {
    const userTurns = addUserTurn([], { id: 'u1', kind: 'translate', content: 'hi' });
    const out = addAssistantTurn(userTurns, {
      id: 'a1',
      kind: 'translate',
      attachedToTurnId: 'u1',
      contextSent: null,
    });
    expect(out[1]?.contextSent).toBeNull();
  });

  it('omits contextSent from Turn when not passed', () => {
    const userTurns = addUserTurn([], { id: 'u1', kind: 'translate', content: 'hi' });
    const out = addAssistantTurn(userTurns, {
      id: 'a1',
      kind: 'translate',
      attachedToTurnId: 'u1',
    });
    expect('contextSent' in (out[1] ?? {})).toBe(false);
  });

  it('preserves contextSent=null on retry-path (addAssistantTurn with null)', () => {
    const userTurns = addUserTurn([], { id: 'u1', kind: 'translate', content: 'hi' });
    const out = addAssistantTurn(userTurns, {
      id: 'a2',
      kind: 'translate',
      attachedToTurnId: 'u1',
      contextSent: null,
    });
    expect(out[1]?.contextSent).toBeNull();
  });
});
