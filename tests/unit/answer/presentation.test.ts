import { describe, expect, it } from 'vitest';
import { answerDetailText, mainAnswerItems } from '@/shared/answer-presentation';
import type { AnswerSnapshot } from '@/shared/types';
import { readAnswer } from '@/shared/answer/reader';

describe('typed answer presentation', () => {
  it('formats scores and yes/no fields for people', () => {
    expect(answerDetailText(0.85, 'score')).toBe('85%');
    expect(answerDetailText(true, 'yesno')).toBe('Yes');
    expect(answerDetailText(0.85, 'text')).toBe('0.85');
  });
  it('ignores malformed snapshots restored from older storage', () => {
    for (const answer of [{}, { spec: {} }, { spec: { fields: [null] } }]) {
      expect(mainAnswerItems(answer as unknown as AnswerSnapshot)).toBeUndefined();
    }
  });
  it('uses typed labels in visible notes while preserving raw values', () => {
    const result = readAnswer(
      {
        id: 'custom:typed',
        version: 1,
        join: 'after-build',
        fields: [
          { key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true },
          { key: 'score', label: 'Confidence', kind: 'score', role: 'notes', required: false },
          { key: 'keep', label: 'Keep it', kind: 'yesno', role: 'notes', required: false },
        ],
      },
      '{"answer":"Hello","score":0.85,"keep":true}',
    );
    expect(result).toMatchObject({
      kind: 'ok',
      fields: { score: 0.85, keep: true },
      notes: [
        { key: 'score', text: '85%' },
        { key: 'keep', text: 'Yes' },
      ],
    });
  });
});
