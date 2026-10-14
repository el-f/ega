import { describe, it, expect } from 'vitest';
import {
  ALL_TURN_KINDS,
  TURN_KIND_LABEL,
  activeVariant,
  answerLangs,
  dropOrphanHead,
  type Turn,
  type AssistantTurnData,
} from '@/sidepanel/state/conversation';
import { userTurn } from '@tests/_helpers/turns';
import { asLangSelection } from '@/shared/brands';

function assistantTurn(id: string, attachedToTurnId?: string): AssistantTurnData {
  return {
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt: 2,
    content: 'reply',
    ...(attachedToTurnId !== undefined ? { attachedToTurnId } : {}),
  };
}

describe('ALL_TURN_KINDS', () => {
  it('is the source the TurnKind union derives from, so the label map cannot drift', () => {
    expect([...ALL_TURN_KINDS].sort()).toEqual(Object.keys(TURN_KIND_LABEL).sort());
  });

  it('has no duplicate entries', () => {
    expect(new Set(ALL_TURN_KINDS).size).toBe(ALL_TURN_KINDS.length);
  });
});

describe('activeVariant', () => {
  it('returns the variant activeVariantIdx points at', () => {
    const turn: Turn = {
      ...assistantTurn('a1', 'u1'),
      variants: [
        { id: 'v1', status: 'done', content: 'one' },
        { id: 'v2', status: 'done', content: 'two' },
      ],
      activeVariantIdx: 1,
    };
    expect(activeVariant(turn)?.content).toBe('two');
  });

  it('returns undefined when the turn carries no variants', () => {
    expect(activeVariant(assistantTurn('a1', 'u1'))).toBeUndefined();
  });

  it('returns undefined for an out-of-range index', () => {
    const turn: Turn = {
      ...assistantTurn('a1', 'u1'),
      variants: [{ id: 'v1', status: 'done', content: 'one' }],
      activeVariantIdx: 4,
    };
    expect(activeVariant(turn)).toBeUndefined();
  });
});

describe('dropOrphanHead', () => {
  it('drops a leading assistant turn whose user turn was trimmed away', () => {
    const original = [userTurn('u1'), assistantTurn('a1', 'u1'), userTurn('u2')];
    const trimmed = original.slice(1);
    expect(dropOrphanHead(trimmed, original).map((t) => t.id)).toEqual(['u2']);
  });

  it('drops every consecutive orphan at the head', () => {
    const original = [
      userTurn('u1'),
      assistantTurn('a1', 'u1'),
      assistantTurn('a2', 'u1'),
      userTurn('u2'),
    ];
    const trimmed = original.slice(1);
    expect(dropOrphanHead(trimmed, original).map((t) => t.id)).toEqual(['u2']);
  });

  it('keeps a lone assistant turn when nothing was trimmed', () => {
    const original = [assistantTurn('a1', 'u1')];
    expect(dropOrphanHead(original, original).map((t) => t.id)).toEqual(['a1']);
  });

  it('keeps a leading assistant turn whose user turn survived the trim', () => {
    const original = [userTurn('u0'), userTurn('u1'), assistantTurn('a1', 'u1')];
    const trimmed = original.slice(1);
    expect(dropOrphanHead(trimmed, original).map((t) => t.id)).toEqual(['u1', 'a1']);
  });

  it('leaves a user-turn head alone', () => {
    const original = [userTurn('u1'), userTurn('u2')];
    const trimmed = original.slice(1);
    expect(dropOrphanHead(trimmed, original).map((t) => t.id)).toEqual(['u2']);
  });
});

describe('answerLangs', () => {
  it('maps each answer to the language its send asked for', () => {
    const turns: Turn[] = [
      {
        id: 'u1',
        role: 'user',
        kind: 'translate',
        status: 'idle',
        content: 'hola',
        createdAt: 1,
        dispatch: {
          sourceLang: asLangSelection('auto'),
          targetLang: asLangSelection('fr'),
          stream: true,
        },
      },
      assistantTurn('a1', 'u1'),
      { id: 'u2', role: 'user', kind: 'translate', status: 'idle', content: 'x', createdAt: 2 },
      assistantTurn('a2', 'u2'),
    ];
    expect([...answerLangs(turns)]).toEqual([['a1', { sourceLang: 'auto', targetLang: 'fr' }]]);
  });
});
