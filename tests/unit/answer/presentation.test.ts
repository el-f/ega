import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { answerDetailText, mainAnswerItems, soleFencedCode } from '@/shared/answer-presentation';
import type { AnswerSnapshot } from '@/shared/types';
import { readAnswer } from '@/shared/answer/reader';

describe('soleFencedCode', () => {
  const codeLines = fc
    .array(
      fc.oneof(fc.string(), fc.constantFrom('', '  <p>indented</p>', '\tx;', '```js', '``x``')),
    )
    .map((lines) => lines.join('\n'));
  it('reads back any code wrapped in one fence', () => {
    fc.assert(
      fc.property(codeLines, fc.constantFrom('```ts', '````', '~~~'), (code, open) => {
        fc.pre(!code.split('\n').some((line) => /^\s*(?:`{3,}|~{3,})\s*$/.test(line)));
        const close = open.startsWith('~') ? '~~~' : '`'.repeat(open.replace(/\w/g, '').length);
        expect(soleFencedCode(`${open}\n${code}\n${close}`)).toBe(code);
      }),
    );
  });
  it.each([
    'Hello',
    '```inline``` code',
    'a\n```\nb\n```',
    '```\na\n```\nmore',
    '```\na\n```\n```\nb\n```',
    '~~~ Segunda parte ~~~',
    '``` does not render here',
  ])('is null for anything else: %j', (answer) => expect(soleFencedCode(answer)).toBeNull());
});

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
