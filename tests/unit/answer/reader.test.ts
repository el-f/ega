import { describe, expect, it, vi } from 'vitest';
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
  it('keeps a JSON main whole when the outer envelope carries its own fields', () => {
    for (const inner of [
      JSON.stringify({ text: 'Bonjour', confidence: 0.1, detectedLang: 'xx' }),
      JSON.stringify({ translation: 'Bonjour', confidence: 0.1, detectedLang: 'xx' }),
    ])
      expect(
        readAnswer(
          translate,
          JSON.stringify({ translation: inner, confidence: 0.95, detectedLang: 'en' }),
        ),
      ).toMatchObject({
        kind: 'ok',
        main: inner,
        fields: { confidence: 0.95, detectedLang: 'en' },
        issues: [],
      });
  });
  it('keeps a translated JSON object as the main text when it lacks the main key', () => {
    for (const inner of ['{"greeting": "Bonjour", "bye": "Au revoir"}', '{"text": "Bonjour"}']) {
      const result = readAnswer(translate, JSON.stringify({ translation: inner }));
      expect(result).toMatchObject({ kind: 'ok', main: inner });
      if (result.kind === 'ok') expect(result.issues.join(' ')).not.toMatch(/Unwrapped/);
    }
  });
  it.each([
    'Use this config:\n{"output": "dist", "minify": true}',
    '{"result": "ok"} is what the API returns on success.',
    'To build it, set {"output": "dist"} in vite.config and run pnpm build.',
    'The reply is:\n```json\n{"text": "hi"}\n```\nThen the client shows it.',
  ])('reads prose that quotes a JSON object as prose: %j', (raw) => {
    for (const spec of [answerSpecFor('ask'), answerSpecFor('summarize')]) {
      expect(readAnswer(spec, raw)).toMatchObject({ kind: 'ok', main: raw, via: 'prose' });
      const projector = createAnswerProjector(spec);
      for (const ch of raw) projector.push(ch);
      expect(projector.finish()).toMatchObject({ kind: 'ok', main: raw });
    }
  });
  // The Translate prompt asks for code as one fenced block; code that holds an answer key is still the answer.
  it.each([
    '```html\n<h1>Hello</h1>\n<p>hi</p>\n```',
    '```json\n{"text": "hello", "title": "x"}\n```',
    '```json\n{"translation": "hello"}\n```',
    '```js\nconst a = {"answer": "hi"};\n```',
    '~~~json\n{"translation": "hello"}\n~~~',
    '~~~js\nconst a = {"answer": "hi"};\n~~~',
  ])('keeps a fenced code answer whole: %j', (code) => {
    const raw = JSON.stringify({ translation: code, confidence: 0.8 });
    expect(readAnswer(translate, raw)).toMatchObject({ kind: 'ok', main: code, issues: [] });
    const projector = createAnswerProjector(translate);
    let visible = '';
    for (const ch of raw) {
      const delta = projector.push(ch);
      if (delta) visible = delta.replace ? delta.text : visible + delta.text;
    }
    expect(visible).toBe(code);
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
    expect(readAnswer(translate, '{"translation":"')).toMatchObject({
      kind: 'error',
      code: 'PARSE',
    });
  });
  // A cut stream or a broken envelope must not be shown and cached as a finished answer.
  it.each([
    [answerSpecFor('ask'), '{"translation": "Step 1: open the file. Step 2: cl'],
    [translate, '{"translation": "The meeting is moved to Thurs'],
    [translate, '{"translation": "He shouted "Stop", "Wait" then left", "confidence": 0.9}'],
    [custom, 'Here it is: {"answer": "Half an ans'],
  ])('fails an envelope that never closes: %#', (spec, raw) => {
    expect(readAnswer(spec, raw)).toMatchObject({ kind: 'error', code: 'PARSE' });
    const projector = createAnswerProjector(spec);
    projector.push(raw);
    expect(projector.finish()).toMatchObject({ kind: 'error', code: 'PARSE' });
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
  it('holds an opening JSON fence until the main text arrives', () => {
    const projector = createAnswerProjector(translate);
    let visible = '';
    for (const ch of '```json\n{"translation":"Hello"}\n```') {
      const delta = projector.push(ch);
      if (delta) visible = delta.replace ? delta.text : visible + delta.text;
      expect('Hello'.startsWith(visible)).toBe(true);
    }
    expect(visible).toBe('Hello');
  });
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
  // A prompt-only model can answer in Markdown that quotes JSON; the live text must keep up and the answer must stand.
  it.each([
    'Example payload: {"name": "x"} and then a long explanation follows.',
    'The payload is {"user": "bob", "age": 3} and the server reads the user field.',
    'Set it like this:\n```json\n{"port": 8080}\n```\nThen restart the server.',
  ])('streams prose that quotes a keyless JSON object: %j', (raw) => {
    for (const spec of [answerSpecFor('ask'), custom]) {
      const projector = createAnswerProjector(spec);
      let visible = '';
      for (let at = 0; at < raw.length; at += 3) {
        const delta = projector.push(raw.slice(at, at + 3));
        if (delta) visible = delta.replace ? delta.text : visible + delta.text;
      }
      expect(visible).toBe(raw);
      expect(projector.finish()).toMatchObject({ kind: 'ok', main: raw, via: 'prose' });
    }
  });
  // A full read re-parses the whole answer, so one per brace-ending delta costs the square of its length.
  it.each([
    [
      'an envelope',
      translate,
      (code: string) => JSON.stringify({ translation: code, confidence: 0.9 }),
    ],
    ['prose', answerSpecFor('ask'), (code: string) => `Here is the code:\n\n${code}\n\nRun it.`],
  ])('re-reads %s holding code a bounded number of times', (_name, spec, wrap) => {
    const code = Array.from({ length: 200 }, (_, i) => `function f${i}() { return ${i}; }`).join(
      '\n',
    );
    const raw = wrap(code);
    const projector = createAnswerProjector(spec);
    const parse = vi.spyOn(JSON, 'parse');
    let visible = '';
    try {
      // Every delta ends at a brace, the worst case for a tail-triggered read.
      for (const piece of raw.split(/(?<=\})/)) {
        const delta = projector.push(piece);
        if (delta) visible = delta.replace ? delta.text : visible + delta.text;
      }
      expect(parse.mock.calls.length).toBeLessThan(20);
    } finally {
      parse.mockRestore();
    }
    const answer = projector.finish();
    expect(answer.kind === 'ok' && answer.main).toBe(spec === translate ? code : raw);
    expect(visible).toBe(spec === translate ? code : raw);
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
