import { describe, it, expect } from 'vitest';
import type { TranslationChunk } from '@/shared/types';
import {
  applyChunk as applySidepanelChunk,
  addAssistantTurn,
  addUserTurn,
  emptyConversation,
} from '@/sidepanel/state/conversation';
import { streamingTranslation, parseJsonResponse } from '@/shared/backends/base';
import { createAnswerProjector, readAnswer } from '@/shared/answer/reader';
import { TRANSLATE_SPEC } from '@/shared/answer/spec';

function streamDeltas(deltas: string[]): TranslationChunk[] {
  const projector = createAnswerProjector(TRANSLATE_SPEC);
  return deltas.map((raw) => ({
    type: 'delta',
    requestId: 'r',
    ...(projector.push(raw) ?? { text: '' }),
  }));
}

function seededSidepanel(): ReturnType<typeof addAssistantTurn> {
  const initial = emptyConversation();
  let turns = addUserTurn(initial.turns, {
    id: 'u1',
    kind: 'translate',
    content: 'seed',
  });
  turns = addAssistantTurn(turns, {
    id: 'a1',
    kind: 'translate',
    attachedToTurnId: 'u1',
  });
  return turns;
}

describe('streaming end-to-end', () => {
  it('JSON-envelope deltas never leak into the visible translation (sidepanel ascii)', () => {
    const deltas = ['{', '"trans', 'lation":"', 'Hello', ' world', '"}'];
    const turns = seededSidepanel();
    const renderedAtEachStep: string[] = [];

    for (const c of streamDeltas(deltas)) {
      applySidepanelChunk(turns, 'a1', c);
      const a = turns.find((t) => t.id === 'a1');
      renderedAtEachStep.push(a?.content ?? '');
    }
    const fullBody = deltas.join('');
    const parsed = readAnswer(TRANSLATE_SPEC, fullBody);
    if (parsed.kind !== 'ok') throw new Error(parsed.code);
    applySidepanelChunk(turns, 'a1', {
      type: 'done',
      requestId: 'r',
      text: parsed.main,
    });

    // The turn stays empty until the first char of the JSON value arrives.
    const envelopePhase = renderedAtEachStep.slice(0, 3);
    expect(envelopePhase.every((s) => s === '')).toBe(true);

    const finalTurn = turns.find((t) => t.id === 'a1');
    expect(finalTurn?.content).toBe('Hello world');
    expect(finalTurn?.status).toBe('done');
  });

  it('JSON-envelope deltas never leak into the visible translation (sidepanel arabic)', () => {
    const deltas = ['{', '"transl', 'ation":"', 'مرحبا', '"}'];
    const turns = seededSidepanel();

    const renderedAtEachStep: string[] = [];
    for (const c of streamDeltas(deltas)) {
      applySidepanelChunk(turns, 'a1', c);
      const a = turns.find((t) => t.id === 'a1');
      renderedAtEachStep.push(a?.content ?? '');
    }
    applySidepanelChunk(turns, 'a1', {
      type: 'done',
      requestId: 'r',
      text: 'مرحبا',
      confidence: 0.9,
    });

    const envelopePhase = renderedAtEachStep.slice(0, 2);
    expect(envelopePhase.every((s) => s === '')).toBe(true);

    const finalTurn = turns.find((t) => t.id === 'a1');
    expect(finalTurn?.content).toBe('مرحبا');
    expect(finalTurn?.status).toBe('done');
  });

  it('plain-text streaming surfaces every delta progressively (no envelope to hide)', () => {
    const deltas = ['Hel', 'lo, ', 'world!'];
    const turns = seededSidepanel();
    const renderedAtEachStep: string[] = [];

    for (const c of streamDeltas(deltas)) {
      applySidepanelChunk(turns, 'a1', c);
      const a = turns.find((t) => t.id === 'a1');
      renderedAtEachStep.push(a?.content ?? '');
    }

    // Projected deltas preserve whitespace; the UI displays them as sent.
    expect(renderedAtEachStep).toEqual(['Hel', 'Hello, ', 'Hello, world!']);
    const finalTurn = turns.find((t) => t.id === 'a1');
    expect(finalTurn?.content).toBe('Hello, world!');
  });

  it('streamingTranslation helper integration: empty for envelope, value for partial', () => {
    expect(streamingTranslation('{', parseJsonResponse('{'))).toBe('');
    expect(streamingTranslation('{"', parseJsonResponse('{"'))).toBe('');
    expect(streamingTranslation('{"translation":"H', parseJsonResponse('{"translation":"H'))).toBe(
      'H',
    );
    expect(
      streamingTranslation('{"translation":"Hello"}', parseJsonResponse('{"translation":"Hello"}')),
    ).toBe('Hello');
    expect(streamingTranslation('plain text reply', parseJsonResponse('plain text reply'))).toBe(
      'plain text reply',
    );
  });
});
