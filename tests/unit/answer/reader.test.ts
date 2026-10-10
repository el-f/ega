import { describe, expect, it } from 'vitest';
import { answerSpecFor, type AnswerSpec } from '@/shared/answer/spec';
import { readAnswer, createAnswerProjector } from '@/shared/answer/reader';
import * as fc from 'fast-check';

const translate = answerSpecFor('translate');
const custom: AnswerSpec = {
  id: 'custom:test',
  version: 1,
  join: 'after-build',
  fields: [
    { key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true },
    { key: 'steps', label: 'Steps', kind: 'list', role: 'notes', required: false },
    { key: 'keep', label: 'Keep it', kind: 'yesno', role: 'details', required: false },
    {
      key: 'style',
      label: 'Style',
      kind: 'choice',
      role: 'details',
      required: false,
      choices: ['Formal', 'Casual'],
    },
  ],
};

describe('the service worker answer reader', () => {
  it.each(['translation', 'Translation', 'answer', 'result', 'output', 'text', 'response'])(
    'accepts the main key %s',
    (key) => {
      expect(readAnswer(translate, JSON.stringify({ [key]: 'Hello' }))).toMatchObject({
        kind: 'ok',
        main: 'Hello',
      });
    },
  );
  it('prefers the exact key to a case variant and an alias', () => {
    expect(
      readAnswer(translate, '{"answer":"alias","Translation":"case","translation":"exact"}'),
    ).toMatchObject({ kind: 'ok', main: 'exact' });
  });
  it.each([
    '```json\n{"translation":"Hello",}\n```',
    '{"translation":"Hello\nthere"}',
    'Before {translation}: {"translation":"Hello"}',
  ])('repairs existing envelopes: %s', (raw) => {
    const result = readAnswer(translate, raw);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.main).toMatch(/^Hello/);
  });
  it('unwraps one object array and one double-encoded main', () => {
    expect(readAnswer(translate, '[{"translation":"Hello"}]')).toMatchObject({
      kind: 'ok',
      main: 'Hello',
    });
    expect(
      readAnswer(
        translate,
        JSON.stringify({ translation: JSON.stringify({ translation: 'Hello', confidence: 0.8 }) }),
      ),
    ).toMatchObject({ kind: 'ok', main: 'Hello', fields: { confidence: 0.8 } });
  });
  it.each([
    [0.85, 0.85],
    ['0.85', 0.85],
    ['85%', 0.85],
    [85, 0.85],
    ['high', undefined],
    [5, undefined],
  ])('normalizes confidence %s safely', (value, expected) => {
    const result = readAnswer(
      translate,
      JSON.stringify({ translation: 'Hello', confidence: value }),
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.fields['confidence']).toBe(expected);
  });
  it('coerces text, notes, lists, choices and yes/no without losing other fields', () => {
    const result = readAnswer(
      custom,
      JSON.stringify({
        answer: ['Hello', 'there'],
        steps: '- First\n• Second',
        keep: 'YES',
        style: 'casual',
        extra: 42,
      }),
    );
    expect(result).toMatchObject({
      kind: 'ok',
      main: 'Hello\nthere',
      fields: { keep: true, style: 'Casual' },
      notes: [{ key: 'steps', label: 'Steps', items: ['First', 'Second'] }],
      details: [
        { key: 'keep', value: true },
        { key: 'style', value: 'Casual' },
        { key: 'extra', value: 42 },
      ],
    });
  });
  it('takes a single unclaimed custom string as main and explains the recovery', () => {
    expect(readAnswer(custom, '{"myResult":"Hello","keep":true}')).toMatchObject({
      kind: 'ok',
      main: 'Hello',
    });
    expect(readAnswer(custom, '{"first":"Hello","second":"there"}')).toMatchObject({
      kind: 'error',
      code: 'PARSE',
    });
  });
  it('keeps an invalid non-main value with an issue instead of failing the answer', () => {
    const result = readAnswer(custom, '{"answer":"Hello","keep":"perhaps","style":"loud"}');
    expect(result).toMatchObject({
      kind: 'ok',
      main: 'Hello',
      fields: { keep: 'perhaps', style: 'loud' },
    });
    if (result.kind === 'ok') expect(result.issues).toHaveLength(2);
  });
  it('accepts an explicitly empty image answer, but distinguishes nothing and wrong format', () => {
    expect(readAnswer(answerSpecFor('ocr'), '{"translation":"","confidence":0}')).toMatchObject({
      kind: 'ok',
      main: '',
    });
    expect(readAnswer(translate, ' \n')).toMatchObject({ kind: 'error', code: 'EMPTY' });
    expect(readAnswer(translate, '{"confidence":0.8}')).toMatchObject({
      kind: 'error',
      code: 'PARSE',
    });
    expect(readAnswer(translate, '{"translation":123}')).toMatchObject({
      kind: 'error',
      code: 'PARSE',
    });
  });
  it('preserves plain answers and fenced plain text', () => {
    for (const text of ['Hello', '```text\nHello\n```', 'Text with {braces}.'])
      expect(readAnswer(translate, text)).toMatchObject({ kind: 'ok', main: text, via: 'prose' });
  });
  it('joins Explain notes and retains only bounded language details', () => {
    const result = readAnswer(
      translate,
      JSON.stringify({
        translation: 'Hello',
        explain: ['First note', 'Second note'],
        detectedDetail: 'x'.repeat(200),
        detectedLangs: [
          'en',
          { id: 'he', detail: 'x'.repeat(200) },
          { id: 'ar', detail: 'Levantine' },
        ],
      }),
      { explain: true },
    );
    expect(result).toMatchObject({
      kind: 'ok',
      notes: [{ key: 'explain', text: 'First note\nSecond note' }],
      fields: { detectedLangs: [{ id: 'en' }, { id: 'he' }, { id: 'ar', detail: 'Levantine' }] },
    });
    if (result.kind === 'ok') {
      expect(result.fields).not.toHaveProperty('detectedDetail');
      expect(result.issues).toContain('Language detail: unexpected text value.');
    }
  });
});

describe('visible answer projection', () => {
  it('never emits the JSON envelope or metadata as visible answer text', () => {
    const projector = createAnswerProjector(translate);
    let visible = '';
    const observed: string[] = [];
    for (const ch of '{"translation":"Hello \\u05e9","confidence":0.9}') {
      const delta = projector.push(ch);
      if (delta) visible = delta.replace ? delta.text : visible + delta.text;
      observed.push(visible);
    }
    expect(observed.every((text) => 'Hello ש'.startsWith(text))).toBe(true);
    expect(visible).toBe('Hello ש');
    expect(projector.finish()).toMatchObject({
      kind: 'ok',
      main: 'Hello ש',
      fields: { confidence: 0.9 },
    });
  });
  it('streams a custom main key and replaces a prose preamble when JSON arrives', () => {
    const customProjector = createAnswerProjector(custom);
    expect(customProjector.push('{"answer":"Hel')).toEqual({ text: 'Hel' });
    expect(customProjector.push('lo"}')).toEqual({ text: 'lo' });
    const projector = createAnswerProjector(translate);
    expect(projector.push('Here it is: ')).toEqual({ text: 'Here it is: ' });
    expect(projector.push('{"translation":"Hello"}')).toEqual({ text: 'Hello', replace: true });
  });
  it('keeps an invalid envelope invisible so the router can retry', () => {
    const projector = createAnswerProjector(translate);
    expect(projector.push('{"wrong":')).toBeUndefined();
    expect(projector.push('123}')).toBeUndefined();
    expect(projector.finish()).toMatchObject({ kind: 'error', code: 'PARSE' });
  });
  it('hides an envelope that arrives one character at a time after a prose preamble', () => {
    const projector = createAnswerProjector(translate);
    let visible = '';
    const observed: string[] = [];
    for (const ch of 'Here it is: {"translation":"Hello","confidence":0.9}') {
      const delta = projector.push(ch);
      if (delta) visible = delta.replace ? delta.text : visible + delta.text;
      observed.push(visible);
    }
    expect(observed.every((text) => !/[{}"]/.test(text))).toBe(true);
    expect(visible).toBe('Hello');
  });
  it('keeps the final answer stable across random chunk boundaries and repairs', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.integer({ min: 1, max: 19 }), { minLength: 1, maxLength: 12 }),
        fc.constantFrom('json', 'fenced', 'comma', 'preamble'),
        (main, sizes, wrapper) => {
          const json = JSON.stringify({ answer: main, steps: ['One', 'Two'], keep: true });
          const raw =
            wrapper === 'fenced'
              ? `\x60\x60\x60json\n${json}\n\x60\x60\x60`
              : wrapper === 'comma'
                ? json.slice(0, -1) + ',}'
                : wrapper === 'preamble'
                  ? `Here is the answer:\n${json}`
                  : json;
          const projector = createAnswerProjector(custom);
          let visible = '';
          let at = 0;
          let index = 0;
          while (at < raw.length) {
            const size = sizes[index++ % sizes.length] ?? 1;
            const delta = projector.push(raw.slice(at, at + size));
            if (delta) visible = delta.replace ? delta.text : visible + delta.text;
            at += size;
          }
          expect(projector.finish()).toMatchObject({ kind: 'ok', main });
          expect(visible).toBe(main);
        },
      ),
      { numRuns: 100 },
    );
  });
});
