import { describe, it, expect } from 'vitest';
import {
  addAssistantTurn,
  addUserTurn,
  applyChunk,
  cancel,
  emptyConversation,
  findEditableLastUserTurn,
  findRetryTarget,
  dropLastUserExchange,
  type Turn,
} from '@/sidepanel/state/conversation';
import type { TranslationChunk } from '@/shared/types';

const u = (id: string, content = ''): Turn => ({
  createdAt: 1,
  id,
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content,
});
// Mirrors addAssistantTurn: every assistant turn carries its seed variant, which the reducer drives.
const a = (id: string, attachedToTurnId: string, content = ''): Turn => ({
  createdAt: 1,
  id,
  role: 'assistant',
  kind: 'translate',
  status: 'pending',
  content,
  rawAcc: '',
  attachedToTurnId,
  variants: [{ id: `${id}:v1`, status: 'pending', content, rawAcc: '' }],
  activeVariantIdx: 0,
});

describe('conversation pure helpers', () => {
  describe('emptyConversation', () => {
    it('returns an empty conversation snapshot', () => {
      expect(emptyConversation()).toEqual({ turns: [], inflightId: null });
    });
  });

  describe('addUserTurn', () => {
    it('appends a translate user turn with the supplied id', () => {
      const out = addUserTurn([], { id: 't1', kind: 'translate', content: 'hi' });
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: 't1',
        role: 'user',
        kind: 'translate',
        status: 'idle',
        content: 'hi',
      });
    });

    it('preserves prior turns and returns a new array', () => {
      const prior: Turn[] = [u('p0', 'prev')];
      const out = addUserTurn(prior, { id: 'p1', kind: 'ask', content: 'why?' });
      expect(out).not.toBe(prior);
      expect(out).toHaveLength(2);
      expect(out[1]).toMatchObject({ kind: 'ask', content: 'why?', status: 'idle' });
    });

    it('captures imageDataUrl on image-translate user turns', () => {
      const out = addUserTurn([], {
        id: 'img',
        kind: 'image-translate',
        content: '[image]',
        imageDataUrl: 'data:image/png;base64,iVBOR',
      });
      expect(out[0]?.imageDataUrl).toBe('data:image/png;base64,iVBOR');
    });
  });

  describe('addAssistantTurn', () => {
    it('appends a pending assistant turn linked to the prior user turn', () => {
      const turns = addUserTurn([], { id: 'u1', kind: 'translate', content: 'x' });
      const out = addAssistantTurn(turns, {
        id: 'a1',
        kind: 'translate',
        attachedToTurnId: 'u1',
      });
      expect(out).toHaveLength(2);
      expect(out[1]).toMatchObject({
        id: 'a1',
        role: 'assistant',
        status: 'pending',
        attachedToTurnId: 'u1',
        content: '',
      });
    });
  });

  describe('applyChunk — delta', () => {
    it('appends visible text and flips pending → streaming on first delta', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      const c: TranslationChunk = {
        type: 'delta',
        requestId: 'r',
        text: 'hel',
      };
      applyChunk(turns, 'a1', c);
      expect(turns[0]?.status).toBe('streaming');
      expect(turns[0]?.content).toBe('hel');
    });

    it('subsequent delta keeps appending and stays streaming', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      applyChunk(turns, 'a1', { type: 'delta', requestId: 'r', text: 'foo ' });
      applyChunk(turns, 'a1', { type: 'delta', requestId: 'r', text: 'bar' });
      expect(turns[0]?.content).toBe('foo bar');
      expect(turns[0]?.status).toBe('streaming');
    });

    it('preserves punctuation in visible text without interpreting it as an envelope', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      applyChunk(turns, 'a1', { type: 'delta', requestId: 'r', text: '{"' });
      expect(turns[0]?.content).toBe('{"');
    });
  });

  describe('applyChunk — done', () => {
    it('finalizes confidence + detected language + meta and flips → done', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      applyChunk(turns, 'a1', {
        type: 'delta',
        requestId: 'r',
        text: 'hello',
      });
      applyChunk(turns, 'a1', {
        type: 'done',
        requestId: 'r',
        confidence: 0.95,
        detectedLang: 'en',
        detectedDetail: 'casual',
        detectedLangs: [{ id: 'arabizi' }, { id: 'genz-slang' }],
      });
      const t = turns[0];
      expect(t?.status).toBe('done');
      expect(t?.content).toBe('hello');
      expect(t?.confidence).toBe(0.95);
      expect(t?.detectedLang).toBe('en');
      expect(t?.detectedDetail).toBe('casual');
      expect(t?.detectedLangs).toEqual([{ id: 'arabizi' }, { id: 'genz-slang' }]);
    });
  });

  describe('applyChunk — error', () => {
    it('flips → error and stamps code + message', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      applyChunk(turns, 'a1', {
        type: 'error',
        requestId: 'r',
        code: 'NETWORK',
        message: 'connection refused',
      });
      expect(turns[0]?.status).toBe('error');
      expect(turns[0]?.error?.code).toBe('NETWORK');
      // The label is the renderer's, from the code; the message stays the chunk's own words.
      expect(turns[0]?.error?.message).toBe('connection refused');
    });
  });

  describe('applyChunk — terminal-state stickiness', () => {
    it('done is sticky: a late delta is ignored', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      applyChunk(turns, 'a1', {
        type: 'delta',
        requestId: 'r',
        text: 'hello',
      });
      applyChunk(turns, 'a1', { type: 'done', requestId: 'r', confidence: 1 });
      const before = turns[0] ? { ...turns[0] } : undefined;
      applyChunk(turns, 'a1', { type: 'delta', requestId: 'r', text: 'late' });
      expect(turns[0]?.status).toBe('done');
      expect(turns[0]?.content).toBe(before?.content);
      expect(turns[0]?.rawAcc).toBe(before?.rawAcc);
    });

    it('error is sticky: a late done is ignored', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      applyChunk(turns, 'a1', {
        type: 'error',
        requestId: 'r',
        code: 'NETWORK',
        message: 'x',
      });
      applyChunk(turns, 'a1', { type: 'done', requestId: 'r', confidence: 1 });
      expect(turns[0]?.status).toBe('error');
      expect(turns[0]?.confidence).toBeUndefined();
    });
  });

  describe('cancel', () => {
    it('marks the streaming assistant turn errored with code=cancelled', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      cancel(turns, 'a1');
      expect(turns[0]?.status).toBe('error');
      expect(turns[0]?.error?.code).toBe('cancelled');
    });

    it('no-op when the id does not match', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      cancel(turns, 'nope');
      expect(turns[0]?.status).toBe('pending');
      expect(turns[0]?.error).toBeUndefined();
    });

    it('no-op on a turn already in done state', () => {
      const turns: Turn[] = [a('a1', 'u1')];
      applyChunk(turns, 'a1', { type: 'done', requestId: 'r', confidence: 1 });
      cancel(turns, 'a1');
      expect(turns[0]?.status).toBe('done');
      expect(turns[0]?.error).toBeUndefined();
    });
  });

  describe('findRetryTarget', () => {
    it('returns the source user turn for an assistant id', () => {
      const turns: Turn[] = [u('u1', 'q'), a('a1', 'u1', 'reply')];
      const got = findRetryTarget(turns, 'a1');
      expect(got?.id).toBe('u1');
      expect(got?.content).toBe('q');
    });

    it('returns null when assistant turn lacks a link', () => {
      const turns: Turn[] = [
        u('u1'),
        {
          id: 'a1',
          role: 'assistant',
          kind: 'translate',
          status: 'done',
          content: 'x',
          createdAt: 1,
        },
      ];
      expect(findRetryTarget(turns, 'a1')).toBeNull();
    });

    it('returns null when called with a user-turn id', () => {
      const turns: Turn[] = [u('u1'), a('a1', 'u1')];
      expect(findRetryTarget(turns, 'u1')).toBeNull();
    });
  });

  describe('findEditableLastUserTurn', () => {
    it('returns the most recent user turn', () => {
      const turns: Turn[] = [u('u1', 'first'), a('a1', 'u1'), u('u2', 'second')];
      const got = findEditableLastUserTurn(turns);
      expect(got?.id).toBe('u2');
    });

    it('returns null on an empty conversation', () => {
      expect(findEditableLastUserTurn([])).toBeNull();
    });

    it('returns null when only assistant turns exist (defensive)', () => {
      const turns: Turn[] = [
        {
          id: 'a',
          role: 'assistant',
          kind: 'translate',
          status: 'done',
          content: 'x',
          createdAt: 1,
        },
      ];
      expect(findEditableLastUserTurn(turns)).toBeNull();
    });
  });

  describe('dropLastUserExchange', () => {
    it('drops the last user turn and its trailing assistant turn', () => {
      const turns: Turn[] = [u('u1', 'orig'), a('a1', 'u1', 'reply')];
      const out = dropLastUserExchange(turns);
      expect(out).toHaveLength(0);
    });

    it('preserves earlier exchanges, truncating only the last', () => {
      const turns: Turn[] = [
        u('u1', 'first'),
        a('a1', 'u1', 'A1 reply'),
        u('u2', 'second'),
        a('a2', 'u2', 'A2 reply'),
      ];
      const out = dropLastUserExchange(turns);
      expect(out).toHaveLength(2);
      expect(out[0]).toMatchObject({ id: 'u1' });
      expect(out[1]).toMatchObject({ id: 'a1' });
    });

    it('returns a clone unchanged when no user turn exists', () => {
      expect(dropLastUserExchange([])).toEqual([]);
    });
  });
});
