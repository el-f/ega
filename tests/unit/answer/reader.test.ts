import { describe, expect, it, vi } from 'vitest';
import { answerSpecFor, CUSTOM_PRESETS, type AnswerSpec } from '@/shared/answer/spec';
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
    'Send {"answer": "yes"} to confirm the order.',
  ])('reads prose that quotes a JSON object as prose: %j', (raw) => {
    for (const spec of [answerSpecFor('ask'), answerSpecFor('summarize')]) {
      expect(readAnswer(spec, raw)).toMatchObject({ kind: 'ok', main: raw, via: 'prose' });
      const projector = createAnswerProjector(spec);
      for (const ch of raw) projector.push(ch);
      expect(projector.finish()).toMatchObject({ kind: 'ok', main: raw });
    }
  });
  // Chatty models without a schema wrap the answer object in a preamble and a sign-off.
  it.each([
    (o: string) => `Here is the translation:\n\`\`\`json\n${o}\n\`\`\`\nLet me know if you need more.`,
    (o: string) => `Sure: ${o}.`,
    (o: string) => `Here you go:\n\n${o}\n\nLet me know if you need anything else.`,
  ])('reads a keyed object with chatter around it as the answer: %#', (wrap) => {
    for (const [spec, key] of [
      [translate, 'translation'],
      [answerSpecFor('ask'), 'answer'],
    ] as const) {
      const raw = wrap(JSON.stringify({ [key]: 'hola', confidence: 0.9 }));
      const result = readAnswer(spec, raw);
      expect(result, raw).toMatchObject({ kind: 'ok', main: 'hola' });
      expect(result, raw).not.toMatchObject({ via: 'prose' });
    }
  });
  it('keeps streaming a fenced answer once its sign-off arrives, without a read per word', () => {
    const signOff = '\nLet me know if you need more. '.repeat(20);
    const raw = `Here is the translation:\n\`\`\`json\n{"translation": "hola", "confidence": 0.9}\n\`\`\`${signOff}`;
    const projector = createAnswerProjector(translate);
    let visible = '';
    const observed: string[] = [];
    const parse = vi.spyOn(JSON, 'parse');
    try {
      for (const ch of raw) {
        const delta = projector.push(ch);
        if (delta) visible = delta.replace ? delta.text : visible + delta.text;
        observed.push(visible);
      }
      expect(parse.mock.calls.length).toBeLessThan(40);
    } finally {
      parse.mockRestore();
    }
    expect(observed.slice(observed.indexOf('hola'))).toEqual(
      Array(observed.length - observed.indexOf('hola')).fill('hola'),
    );
    expect(projector.finish()).toMatchObject({ kind: 'ok', main: 'hola', via: 'json' });
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
    [answerSpecFor('ask'), '{"answer": "Step 1: open the file. Step 2: cl'],
    [answerSpecFor('reword'), '{"answer": "Hello there.", "explain": "Changed the gree'],
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
  it('drops a detected language id longer than a short label', () => {
    const long = 'x'.repeat(129);
    const result = readAnswer(
      translate,
      JSON.stringify({
        translation: 'Hello',
        detectedLang: long,
        detectedLangs: ['x'.repeat(128), long, { id: long }],
      }),
    );
    expect(result).toMatchObject({
      kind: 'ok',
      fields: { detectedLangs: [{ id: 'x'.repeat(128) }] },
    });
    if (result.kind === 'ok') {
      expect(result.fields).not.toHaveProperty('detectedLang');
      expect(result.issues).toContain('Source language: unexpected language value.');
    }
    expect(
      readAnswer(
        translate,
        JSON.stringify({ translation: 'Hello', detectedLang: 'x'.repeat(128) }),
      ),
    ).toMatchObject({ kind: 'ok', fields: { detectedLang: 'x'.repeat(128) } });
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
  // A built-in prompt edited before the rename still asks for "translation".
  it('streams a built-in answer under the old "translation" key', () => {
    const main = 'The council approved the new budget after a long debate.';
    const raw = JSON.stringify({ translation: main });
    const projector = createAnswerProjector(answerSpecFor('summarize'));
    let visible = '';
    const observed: string[] = [];
    for (let at = 0; at < raw.length; at += 6) {
      const delta = projector.push(raw.slice(at, at + 6));
      if (delta) visible = delta.replace ? delta.text : visible + delta.text;
      observed.push(visible);
    }
    expect(observed.slice(0, -1).some((text) => text.length > 0)).toBe(true);
    expect(observed.every((text) => main.startsWith(text))).toBe(true);
    expect(projector.finish()).toMatchObject({ kind: 'ok', main });
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
    'The API replies {"answer": "ok"} and then closes the socket.',
  ])('streams prose that quotes a JSON object: %j', (raw) => {
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

describe('reading an answer that does not match its spec', () => {
  const card = answerSpecFor('reword');
  const own = (fields: AnswerSpec['fields']): AnswerSpec => ({ ...custom, fields });
  const main = {
    key: 'answer',
    label: 'Answer',
    kind: 'text',
    role: 'main',
    required: true,
  } as const;

  it('reads an alias as the main answer, and says so', () => {
    expect(readAnswer(translate, '{"answer":"hola","confidence":0.9}')).toMatchObject({
      kind: 'ok',
      main: 'hola',
      issues: ['Read the answer from "answer" instead of "translation".'],
    });
  });
  it("never reads another field's key as the main answer", () => {
    const spec = own([
      main,
      { key: 'text', label: 'Text', kind: 'text', role: 'notes', required: false },
    ]);
    const result = readAnswer(spec, '{"text":"the rewrite","result":"R"}');
    expect(result).toMatchObject({
      kind: 'ok',
      main: 'R',
      notes: [{ key: 'text', text: 'the rewrite' }],
    });
    expect(readAnswer(spec, '{"text":"the rewrite"}')).toMatchObject({ kind: 'error' });
  });
  it('matches a key the model named after a field, ignoring case, and says so', () => {
    const spec = own([
      main,
      { key: 'field1', label: 'Tone', kind: 'text', role: 'notes', required: false },
      { key: 'field2', label: 'Key points', kind: 'list', role: 'notes', required: false },
    ]);
    const result = readAnswer(spec, '{"answer":"hi","tone":"warm","Key points":["a","b"]}');
    expect(result).toMatchObject({
      kind: 'ok',
      fields: { field1: 'warm', field2: ['a', 'b'] },
      notes: [
        { key: 'field1', label: 'Tone', text: 'warm' },
        { key: 'field2', label: 'Key points', items: ['a', 'b'] },
      ],
      details: [],
      issues: ['Read Tone from "tone".', 'Read Key points from "Key points".'],
    });
  });
  it("reads a built-in prompt's own format through its only text field, and says so", () => {
    expect(readAnswer(answerSpecFor('summarize'), '{"summary": "S."}')).toMatchObject({
      kind: 'ok',
      main: 'S.',
      issues: ['Used the only unclaimed text field as the answer.'],
    });
  });
  it('treats a blank note or language as left out', () => {
    expect(
      readAnswer(CUSTOM_PRESETS['answer-notes'], '{"answer":"a","explain":" "}'),
    ).toMatchObject({
      kind: 'ok',
      notes: [],
      issues: [],
    });
    expect(readAnswer(card, '{"answer":"a","explain":""}')).toMatchObject({
      kind: 'ok',
      notes: [],
      issues: ['Notes: field missing.'],
    });
    expect(
      readAnswer(translate, '{"translation":"a","confidence":0.9,"detectedLang":""}'),
    ).toMatchObject({ kind: 'ok', fields: { translation: 'a', confidence: 0.9 }, issues: [] });
  });
  it('keeps a main answer over its character limit, and says so', () => {
    const spec = own([{ ...main, maxChars: 10 }]);
    expect(readAnswer(spec, '{"answer":"this is longer than ten"}')).toMatchObject({
      kind: 'ok',
      main: 'this is longer than ten',
      issues: ['Answer: longer than 10 characters.'],
    });
  });
  it('reads an empty list of source languages as left out', () => {
    const result = readAnswer(
      translate,
      '{"translation":"a","confidence":0.9,"detectedLang":"en","detectedLangs":[]}',
    );
    expect(result).toMatchObject({ kind: 'ok', issues: [] });
    if (result.kind === 'ok') expect(result.fields).not.toHaveProperty('detectedLangs');
  });
});
