import { expect, it } from 'vitest';
import {
  addAssistantTurn,
  addUserTurn,
  addVariant,
  applyChunk,
  selectVariant,
  addDeliveredAssistantTurn,
} from '@/sidepanel/state/conversation';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import type { AnswerSnapshot } from '@/shared/types';

const answer: AnswerSnapshot = {
  spec: {
    id: 'custom:deleted',
    version: 1,
    join: 'after-build',
    fields: [
      { key: 'answer', label: 'Answer', kind: 'list', role: 'main', required: true },
      { key: 'points', label: 'Original label', kind: 'list', role: 'notes', required: false },
    ],
  },
  fields: { answer: ['First', 'Second'], points: ['Useful'], hidden: 'For JSON only' },
};
const reply = {
  answer,
  notes: [{ key: 'points', label: 'Original label', items: ['Useful'] }],
  details: [{ key: 'tone', label: 'Tone', value: 'Formal' }],
};

it('stores each variant snapshot and restores its labels after later variants change', async () => {
  let turns = addAssistantTurn(addUserTurn([], { id: 'u', kind: 'translate', content: 'hello' }), {
    id: 'a',
    kind: 'translate',
    attachedToTurnId: 'u',
  });
  applyChunk(turns, 'a', { type: 'done', requestId: 'r', text: 'First\nSecond', ...reply });
  turns = addVariant(turns, 'a', { id: 'v2' });
  expect(turns[1]?.notes).toBeUndefined();
  expect(turns[1]?.answer).toBeUndefined();
  applyChunk(turns, 'a', {
    type: 'done',
    requestId: 'r2',
    text: 'Later',
    notes: [{ key: 'points', label: 'New label', text: 'Different' }],
  });
  await saveThread('https://fields.test', turns);
  turns = selectVariant((await loadThreadResult('https://fields.test')).turns, 'a', 0);
  expect(turns[1]).toMatchObject({ content: 'First\nSecond', ...reply });
  turns = selectVariant(turns, 'a', 1);
  expect(turns[1]?.notes?.[0]?.label).toBe('New label');
  expect(turns[1]?.answer).toBeUndefined();
});

it('lands a completed tooltip reply with its notes and fields as a completed variant', () => {
  const turns = addDeliveredAssistantTurn([], {
    id: 'a',
    kind: 'translate',
    attachedToTurnId: 'u',
    content: 'First\nSecond',
    reply,
  });
  expect(turns[0]).toMatchObject({
    status: 'done',
    ...reply,
    variants: [{ status: 'done', ...reply }],
  });
});
