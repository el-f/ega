import { describe, it, expect } from 'vitest';
import {
  addAssistantTurn,
  addUserTurn,
  addVariant,
  applyChunk,
  cancel,
  selectVariant,
  type Turn,
} from '@/sidepanel/state/conversation';

const seeded = (): Turn[] => {
  const userTurns = addUserTurn([], { id: 'u1', kind: 'translate', content: 'hi' });
  return addAssistantTurn(userTurns, {
    id: 'a1',
    kind: 'translate',
    attachedToTurnId: 'u1',
  });
};

describe('Turn — multi-variant shape', () => {
  it('addAssistantTurn seeds variants: [v1] + activeVariantIdx: 0', () => {
    const turns = seeded();
    const a = turns[1];
    expect(a?.variants).toBeDefined();
    expect(a?.variants).toHaveLength(1);
    expect(a?.activeVariantIdx).toBe(0);
    expect(a?.variants?.[0]?.status).toBe('pending');
    expect(a?.variants?.[0]?.content).toBe('');
  });

  describe('addVariant', () => {
    it('appends a variant + flips activeVariantIdx to the new variant', () => {
      const turns = seeded();
      const out = addVariant(turns, 'a1', {
        id: 'v2',
        refinementBody: 'use pig latin',
      });
      const a = out[1];
      expect(a?.variants).toHaveLength(2);
      expect(a?.activeVariantIdx).toBe(1);
      expect(a?.variants?.[1]?.id).toBe('v2');
      expect(a?.variants?.[1]?.refinementBody).toBe('use pig latin');
      expect(a?.variants?.[1]?.status).toBe('pending');
    });

    it('projects the new active variant onto the Turn top-level (resets pending fields)', () => {
      // First, drive v1 to done so we have non-default top-level fields.
      const turns = seeded();
      applyChunk(turns, 'a1', {
        type: 'delta',
        requestId: 'r',
        text: '{"translation":"hello"}',
      });
      applyChunk(turns, 'a1', {
        type: 'done',
        requestId: 'r',
        confidence: 0.9,
      });
      expect(turns[1]?.status).toBe('done');
      expect(turns[1]?.content).toBe('hello');

      // Adding a variant flips active to the new pending one — top-level fields
      // re-project to the pending variant's state.
      const out = addVariant(turns, 'a1', {
        id: 'v2',
        refinementBody: 'shorter',
      });
      const a = out[1];
      expect(a?.status).toBe('pending');
      expect(a?.content).toBe('');
      expect(a?.confidence).toBeUndefined();
    });

    it('no-op when the turn id does not match', () => {
      const turns = seeded();
      const out = addVariant(turns, 'nope', { id: 'v2' });
      expect(out[1]?.variants).toHaveLength(1);
    });
  });

  describe('selectVariant', () => {
    it('flips activeVariantIdx without dropping variants', () => {
      const turns = seeded();
      const added = addVariant(turns, 'a1', { id: 'v2' });
      const out = selectVariant(added, 'a1', 0);
      expect(out[1]?.activeVariantIdx).toBe(0);
      expect(out[1]?.variants).toHaveLength(2);
    });

    it('projects the selected variant body fields onto the Turn top-level', () => {
      const turns = seeded();
      // Drive v1 to done with distinctive content.
      applyChunk(turns, 'a1', {
        type: 'delta',
        requestId: 'r',
        text: '{"translation":"first"}',
      });
      applyChunk(turns, 'a1', { type: 'done', requestId: 'r', confidence: 0.7 });
      // Add v2 (pending).
      const added = addVariant(turns, 'a1', { id: 'v2' });
      expect(added[1]?.status).toBe('pending');

      // Flip back to v1 — top-level fields restore from v1.
      const back = selectVariant(added, 'a1', 0);
      expect(back[1]?.status).toBe('done');
      expect(back[1]?.content).toBe('first');
      expect(back[1]?.confidence).toBe(0.7);
    });

    it('out-of-range idx is a no-op', () => {
      const turns = seeded();
      const out = selectVariant(turns, 'a1', 5);
      expect(out[1]?.activeVariantIdx).toBe(0);
    });
  });

  describe('applyChunk — variant-aware', () => {
    it('routes delta to the named variant when variantId set', () => {
      const turns = seeded();
      const added = addVariant(turns, 'a1', { id: 'v2', refinementBody: 'shorter' });
      applyChunk(
        added,
        'a1',
        {
          type: 'delta',
          requestId: 'r',
          text: '{"translation":"shrt"}',
        },
        undefined,
        'v2',
      );
      const a = added[1];
      // active variant is v2 → both v2 and top-level reflect the delta.
      expect(a?.variants?.[1]?.rawAcc).toBe('{"translation":"shrt"}');
      expect(a?.variants?.[1]?.status).toBe('streaming');
      expect(a?.content).toBe('shrt');
      expect(a?.status).toBe('streaming');
    });

    it('does NOT overwrite v1 when delta is routed to v2', () => {
      const turns = seeded();
      // Drive v1 to done.
      applyChunk(turns, 'a1', {
        type: 'delta',
        requestId: 'r',
        text: '{"translation":"v1-final"}',
      });
      applyChunk(turns, 'a1', { type: 'done', requestId: 'r', confidence: 0.9 });
      // Add v2 + push a delta into v2.
      const added = addVariant(turns, 'a1', { id: 'v2' });
      applyChunk(
        added,
        'a1',
        {
          type: 'delta',
          requestId: 'r2',
          text: '{"translation":"v2-partial"}',
        },
        undefined,
        'v2',
      );
      // v1 unchanged.
      expect(added[1]?.variants?.[0]?.content).toBe('v1-final');
      expect(added[1]?.variants?.[0]?.status).toBe('done');
      // v2 has the partial.
      expect(added[1]?.variants?.[1]?.content).toBe('v2-partial');
      expect(added[1]?.variants?.[1]?.status).toBe('streaming');
    });

    it('writes the active variant and mirrors it to the turn when variantId is omitted', () => {
      const turns = seeded();
      applyChunk(turns, 'a1', { type: 'delta', requestId: 'r', text: 'plain' });
      // Mirrored onto the turn.
      expect(turns[1]?.rawAcc).toBe('plain');
      // Written to the active variant v1.
      expect(turns[1]?.variants?.[0]?.rawAcc).toBe('plain');
    });

    it('cancel flips active variant to error with same payload as top-level', () => {
      // Cancel must end the inflight variant too, or v2 shows a card that never finishes.
      const turns = seeded();
      const added = addVariant(turns, 'a1', { id: 'v2', refinementBody: 'shorter' });
      // v2 has had one delta, so it's `streaming` not `pending`.
      applyChunk(added, 'a1', { type: 'delta', requestId: 'r', text: 'x' }, undefined, 'v2');
      cancel(added, 'a1');
      const a = added[1];
      expect(a?.status).toBe('error');
      expect(a?.error?.code).toBe('cancelled');
      expect(a?.variants?.[1]?.status).toBe('error');
      expect(a?.variants?.[1]?.error?.code).toBe('cancelled');
      expect(a?.variants?.[1]?.error).toEqual(a?.error);
      // v1 was already `pending` (no chunks) — cancel only targets active.
      expect(a?.variants?.[0]?.status).toBe('pending');
    });

    it('cancel on pending active variant also flips it to error', () => {
      const turns = seeded();
      const added = addVariant(turns, 'a1', { id: 'v2' });
      // v2 is `pending` (no delta yet).
      cancel(added, 'a1');
      const a = added[1];
      expect(a?.status).toBe('error');
      expect(a?.variants?.[1]?.status).toBe('error');
      expect(a?.variants?.[1]?.error?.code).toBe('cancelled');
    });

    it('mirrorVariantToTurn clears stale top-level fields when active variant lacks them', () => {
      // Drive v1 to done with confidence + detectedLang via top-level path so
      // those land on both turn + v1.
      const turns = seeded();
      applyChunk(turns, 'a1', {
        type: 'delta',
        requestId: 'r1',
        text: '{"translation":"hola","detectedLang":"es"}',
      });
      applyChunk(turns, 'a1', { type: 'done', requestId: 'r1', confidence: 0.9 });
      // A delta with no detectedLang routed to v2 must not bring back v1's detectedLang.
      const added = addVariant(turns, 'a1', { id: 'v2' });
      applyChunk(added, 'a1', { type: 'delta', requestId: 'r2', text: 'plain' }, undefined, 'v2');
      const a = added[1];
      expect(a?.content).toBe('plain');
      expect(a?.detectedLang).toBeUndefined();
      expect(a?.confidence).toBeUndefined();
    });

    it('cancel flips ALL inflight variants to error, not just the active one', () => {
      // v2 starts streaming, user switches back to v1 (active = 0), then cancels.
      // v2 must land on error — it was inflight but not active at cancel time.
      const turns = seeded();
      // Drive v1 to done so switching back to it is realistic.
      applyChunk(turns, 'a1', {
        type: 'delta',
        requestId: 'r1',
        text: '{"translation":"v1-done"}',
      });
      applyChunk(turns, 'a1', { type: 'done', requestId: 'r1', confidence: 0.9 });
      // Add v2, push a streaming delta into it.
      const added = addVariant(turns, 'a1', { id: 'v2', refinementBody: 'shorter' });
      applyChunk(
        added,
        'a1',
        {
          type: 'delta',
          requestId: 'r2',
          text: '{"translation":"v2-partial"}',
        },
        undefined,
        'v2',
      );
      expect(added[1]?.variants?.[1]?.status).toBe('streaming');
      // User switches active view back to v1 — v2 is now non-active but still streaming.
      const switched = selectVariant(added, 'a1', 0);
      expect(switched[1]?.activeVariantIdx).toBe(0);
      // Cancel — v2 is not active, but must still be terminated.
      cancel(switched, 'a1');
      const a = switched[1];
      // Active variant (v1) was done — top-level must mirror it: stay done, no error.
      expect(a?.status).toBe('done');
      expect(a?.error).toBeUndefined();
      // v2 was inflight/streaming — must be canceled.
      expect(a?.variants?.[1]?.status).toBe('error');
      expect(a?.variants?.[1]?.error?.code).toBe('cancelled');
      // v1 was done before the cancel — must not be touched.
      expect(a?.variants?.[0]?.status).toBe('done');
    });

    it('done chunk routed to active variant finalizes only that variant', () => {
      const turns = seeded();
      const added = addVariant(turns, 'a1', { id: 'v2' });
      applyChunk(
        added,
        'a1',
        {
          type: 'delta',
          requestId: 'r',
          text: '{"translation":"abc"}',
        },
        undefined,
        'v2',
      );
      applyChunk(
        added,
        'a1',
        {
          type: 'done',
          requestId: 'r',
          confidence: 0.8,
        },
        undefined,
        'v2',
      );
      expect(added[1]?.variants?.[1]?.status).toBe('done');
      expect(added[1]?.variants?.[1]?.confidence).toBe(0.8);
      // v1 still pending (its own state).
      expect(added[1]?.variants?.[0]?.status).toBe('pending');
    });
  });
});
