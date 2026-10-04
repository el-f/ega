import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  addUserTurn,
  addAssistantTurn,
  addDeliveredAssistantTurn,
} from '@/sidepanel/state/conversation';

const FIXED_NOW = 1_718_000_000_000;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Turn.createdAt — set at construction', () => {
  it('addUserTurn sets createdAt to Date.now()', () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const [turn] = addUserTurn([], { id: 'u1', kind: 'translate', content: 'hello' });
    expect(turn?.createdAt).toBe(FIXED_NOW);
  });

  it('addAssistantTurn sets createdAt to Date.now()', () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const [turn] = addAssistantTurn([], {
      id: 'a1',
      kind: 'translate',
      attachedToTurnId: 'u1',
    });
    expect(turn?.createdAt).toBe(FIXED_NOW);
  });

  it('addDeliveredAssistantTurn sets createdAt to Date.now()', () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    const [turn] = addDeliveredAssistantTurn([], {
      id: 'a1',
      kind: 'translate',
      attachedToTurnId: 'u1',
      content: 'delivered',
    });
    expect(turn?.createdAt).toBe(FIXED_NOW);
  });
});
