import { describe, expect, it } from 'vitest';
import {
  addVariant,
  applyChunk,
  failDispatch,
  searchTurns,
  selectVariant,
  visibleTurns,
} from '@/sidepanel/state/conversation';
import type { Variant, UserTurnData, AssistantTurnData } from '@/sidepanel/state/conversation';

function userTurn(id: string, extra: Partial<UserTurnData> = {}): UserTurnData {
  return {
    id,
    role: 'user',
    kind: 'translate',
    status: 'idle',
    createdAt: 1,
    content: id,
    ...extra,
  };
}

function assistantTurn(
  id: string,
  variants: Variant[] | undefined,
  extra: Partial<AssistantTurnData> = {},
): AssistantTurnData {
  return {
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt: 2,
    content: variants?.[0]?.content ?? '',
    attachedToTurnId: 'u1',
    ...(variants ? { variants, activeVariantIdx: 0 } : {}),
    ...extra,
  };
}

describe('addVariant guards', () => {
  it('is a no-op copy when the id names a user turn', () => {
    const turns = [userTurn('u1')];

    const out = addVariant(turns, 'u1', { id: 'v2' });

    expect(out).toEqual(turns);
    expect(out).not.toBe(turns);
  });

  it('is a no-op copy when the assistant turn carries no variants array', () => {
    const turns = [userTurn('u1'), assistantTurn('a1', undefined)];

    const out = addVariant(turns, 'a1', { id: 'v2' });

    expect(out).toEqual(turns);
    expect(out[1]?.variants).toBeUndefined();
  });

  it('carries refinementLabel onto the new variant, separately from the body', () => {
    const turns = [assistantTurn('a1', [{ id: 'v1', status: 'done', content: 'hi' }])];

    const out = addVariant(turns, 'a1', {
      id: 'v2',
      refinementBody: 'make it shorter please',
      refinementLabel: 'Shorter',
    });

    const added = out[0]?.variants?.[1];
    expect(added?.refinementLabel).toBe('Shorter');
    expect(added?.refinementBody).toBe('make it shorter please');
  });

  it('leaves refinementLabel off entirely when the caller passes none', () => {
    const turns = [assistantTurn('a1', [{ id: 'v1', status: 'done', content: 'hi' }])];

    const out = addVariant(turns, 'a1', { id: 'v2', refinementBody: 'shorter' });

    expect(out[0]?.variants?.[1] && 'refinementLabel' in out[0].variants[1]).toBe(false);
  });
});

describe('selectVariant guards', () => {
  it('is a no-op copy when no turn has that id', () => {
    const turns = [assistantTurn('a1', [{ id: 'v1', status: 'done', content: 'hi' }])];

    const out = selectVariant(turns, 'nope', 0);

    expect(out).toEqual(turns);
    expect(out).not.toBe(turns);
  });

  it('is a no-op copy when the turn carries no variants array', () => {
    const turns = [userTurn('u1')];

    const out = selectVariant(turns, 'u1', 0);

    expect(out).toEqual(turns);
    expect(out).not.toBe(turns);
  });
});

describe('a variant that has no rawAcc yet', () => {
  it('accumulates a delta from empty rather than from undefined', () => {
    // A variant restored from storage keeps content and loses rawAcc.
    const variant: Variant = { id: 'v1', status: 'pending', content: '' };
    const turns = [assistantTurn('a1', [variant])];

    const out = applyChunk(turns, 'a1', { type: 'delta', requestId: 'r1', text: 'hello' });

    expect(out[0]?.variants?.[0]?.rawAcc).toBe('hello');
  });

  it('finishes on an empty body rather than on the string "undefined"', () => {
    const variant: Variant = { id: 'v1', status: 'pending', content: '' };
    const turns = [assistantTurn('a1', [variant])];

    const out = applyChunk(turns, 'a1', { type: 'done', requestId: 'r1' });

    expect(out[0]?.variants?.[0]?.status).toBe('done');
    expect(out[0]?.variants?.[0]?.content).toBe('');
  });
});

describe('failDispatch by variant id', () => {
  it('fails the named variant, not the active one', () => {
    const turns = [
      assistantTurn('a1', [
        { id: 'v1', status: 'pending', content: '' },
        { id: 'v2', status: 'pending', content: '' },
      ]),
    ];

    const out = failDispatch(turns, 'a1', 'v2');

    expect(out[0]?.variants?.[0]?.status).toBe('pending');
    expect(out[0]?.variants?.[1]?.status).toBe('error');
    expect(out[0]?.variants?.[1]?.error?.code).toBe('dispatch-failed');
  });

  it('does nothing when the named variant is not on the turn', () => {
    const turns = [assistantTurn('a1', [{ id: 'v1', status: 'pending', content: '' }])];

    const out = failDispatch(turns, 'a1', 'gone');

    expect(out[0]?.variants?.[0]?.status).toBe('pending');
  });
});

describe('an orphan assistant turn', () => {
  // An assistant turn with no attachedToTurnId at all: neither filter can pair it up.
  const withParent = assistantTurn('a9', [{ id: 'v', status: 'done', content: 'orphan text' }], {
    content: 'orphan text',
  });
  const { attachedToTurnId: _none, ...orphan } = withParent;
  void _none;

  it('is dropped by the bookmark filter when it is not itself bookmarked', () => {
    const turns = [userTurn('u1', { bookmarked: true }), orphan];

    expect(visibleTurns(turns, true).map((t) => t.id)).toEqual(['u1']);
  });

  it('is dropped by search when its own text does not match', () => {
    const turns = [userTurn('u1', { content: 'needle' }), orphan];

    expect(searchTurns(turns, 'needle').map((t) => t.id)).toEqual(['u1']);
  });
});
