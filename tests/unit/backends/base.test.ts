import { describe, it, expect } from 'vitest';
import {
  carriesAnswer,
  extractDetectedFields,
  makeDoneChunk,
  parseJsonResponse,
} from '@/shared/backends/base';

describe('parseJsonResponse', () => {
  it('extracts JSON from code fence', () => {
    const r = parseJsonResponse('```json\n{"translation":"hi","confidence":0.9}\n```');
    expect(r).toEqual({ translation: 'hi', confidence: 0.9 });
  });
  it('extracts JSON from plain body', () => {
    expect(parseJsonResponse('{"translation":"yo","confidence":0.5}')).toEqual({
      translation: 'yo',
      confidence: 0.5,
    });
  });
  it('falls back to full body as translation, with no synthesized confidence', () => {
    const r = parseJsonResponse('just a plain string');
    expect(r).toEqual({ translation: 'just a plain string' });
    expect(r).not.toHaveProperty('confidence');
  });
  it('tolerates leading/trailing prose around JSON', () => {
    const r = parseJsonResponse(
      'Sure, here you go: {"translation":"ok","confidence":0.8} — let me know.',
    );
    expect(r).toEqual({ translation: 'ok', confidence: 0.8 });
  });

  it('recovers a partial translation from mid-stream unfinished JSON', () => {
    const r = parseJsonResponse('{"translation":"hello wor');
    expect(r.translation).toBe('hello wor');
    expect(r).not.toHaveProperty('confidence');
  });

  // Returning the raw envelope here would paint `{`, `{"`, `{"trans` in the UI mid-stream.
  it('returns an empty translation for an early JSON envelope (no value yet)', () => {
    expect(parseJsonResponse('{').translation).toBe('');
    expect(parseJsonResponse('{"').translation).toBe('');
    expect(parseJsonResponse('{"trans').translation).toBe('');
    expect(parseJsonResponse('{"translation"').translation).toBe('');
    expect(parseJsonResponse('{"translation":"').translation).toBe('');
    // Some providers send a leading newline before the JSON.
    expect(parseJsonResponse('  \n{').translation).toBe('');
  });

  it('joins an array translation instead of dropping the whole answer', () => {
    const r = parseJsonResponse('{"translation":["line one","line two"],"confidence":0.7}');
    expect(r.translation).toBe('line one\nline two');
    expect(r.confidence).toBe(0.7);
  });

  it('ignores a translation that is neither string nor string array', () => {
    expect(parseJsonResponse('{"translation":{"a":1}}').translation).toBe('');
    expect(parseJsonResponse('{"translation":[1,2]}').translation).toBe('');
  });

  it('non-JSON plain text still falls back to the full body', () => {
    // Only a `{` prefix marks an unfinished envelope; plain text streams through.
    expect(parseJsonResponse('hello wor').translation).toBe('hello wor');
    expect(parseJsonResponse('Bonjour').translation).toBe('Bonjour');
  });

  it('unescapes \\n / \\t / \\r / \\" in partial-stream translations', () => {
    const r = parseJsonResponse('{"translation":"line1\\nline2\\tcol\\rend\\"q');
    expect(r.translation).toBe('line1\nline2\tcol\rend"q');
  });

  it('parses detectedLang and explain fields', () => {
    const r = parseJsonResponse(
      '{"translation":"hi","confidence":0.9,"detectedLang":"arabizi","explain":"greeting"}',
    );
    expect(r).toEqual({
      translation: 'hi',
      confidence: 0.9,
      detectedLang: 'arabizi',
      explain: 'greeting',
    });
  });

  // A small model answering 85 used to clamp to 1 and show "100% sure".
  it('reads a 10..100 confidence as a percent and drops one it cannot place', () => {
    const conf = (raw: string) =>
      parseJsonResponse(`{"translation":"x","confidence":${raw}}`).confidence;
    expect(conf('0.7')).toBe(0.7);
    expect(conf('85')).toBe(0.85);
    expect(conf('"0.9"')).toBe(0.9);
    expect(conf('2')).toBeUndefined();
    expect(conf('-1')).toBeUndefined();
    expect(conf('250')).toBeUndefined();
    expect(conf('"bad"')).toBeUndefined();
  });

  it('parses a detectedLangs array with id + detail entries', () => {
    const r = parseJsonResponse(
      JSON.stringify({
        translation: 'hello',
        confidence: 0.8,
        detectedLangs: [{ id: 'arabizi' }, { id: 'elvish', detail: 'Quenya' }],
      }),
    );
    expect(r.translation).toBe('hello');
    expect(r.detectedLangs).toEqual([{ id: 'arabizi' }, { id: 'elvish', detail: 'Quenya' }]);
  });

  it('ignores a malformed detectedLangs payload (not array / missing id)', () => {
    const bad1 = parseJsonResponse(
      '{"translation":"hi","confidence":0.5,"detectedLangs":"arabizi"}',
    );
    expect(bad1.detectedLangs).toBeUndefined();
    const bad2 = parseJsonResponse(
      '{"translation":"hi","confidence":0.5,"detectedLangs":[{"detail":"lonely"}]}',
    );
    expect(bad2.detectedLangs).toBeUndefined();
  });

  it('single-variety responses still populate detectedLang + detectedDetail only', () => {
    const r = parseJsonResponse(
      '{"translation":"hi","confidence":0.9,"detectedLang":"arabizi","detectedDetail":"Levantine — Lebanese"}',
    );
    expect(r.detectedLang).toBe('arabizi');
    expect(r.detectedDetail).toBe('Levantine — Lebanese');
    expect(r.detectedLangs).toBeUndefined();
  });

  it('drops detail fields longer than 200 chars on a detectedLangs entry', () => {
    const longDetail = 'x'.repeat(300);
    const r = parseJsonResponse(
      JSON.stringify({
        translation: 'hi',
        confidence: 0.7,
        detectedLangs: [{ id: 'arabizi', detail: longDetail }],
      }),
    );
    // The entry survives; only the runaway detail is dropped.
    expect(r.detectedLangs).toEqual([{ id: 'arabizi' }]);
  });
});

describe('carriesAnswer', () => {
  const answer = (raw: string): boolean => carriesAnswer(raw, parseJsonResponse(raw));

  it('accepts a closed envelope with an empty translation — an image with no text', () => {
    expect(answer('{"translation":"","confidence":0}')).toBe(true);
  });

  it('rejects a body that ends mid-envelope', () => {
    expect(answer('{"translation":"')).toBe(false);
    expect(answer('{"trans')).toBe(false);
  });

  it('rejects a closed envelope that never names a translation', () => {
    expect(answer('{"answer":"hi"}')).toBe(false);
  });

  it('accepts a normal answer, an array answer, and plain text', () => {
    expect(answer('{"translation":"hi"}')).toBe(true);
    expect(answer('{"translation":["a","b"]}')).toBe(true);
    expect(answer('Bonjour')).toBe(true);
  });
});

describe('makeDoneChunk', () => {
  it('omits detectedLangs when absent (exactOptionalPropertyTypes)', () => {
    const chunk = makeDoneChunk('req-1', { translation: 't', confidence: 0.5 });
    expect(chunk).not.toHaveProperty('detectedLangs');
  });

  it('omits confidence when the parsed result has none', () => {
    const chunk = makeDoneChunk('req-1b', { translation: 't' });
    expect(chunk).not.toHaveProperty('confidence');
  });

  it('forwards a detectedLangs array through the done chunk', () => {
    const chunk = makeDoneChunk('req-2', {
      translation: 't',
      confidence: 0.7,
      detectedLangs: [{ id: 'arabizi' }, { id: 'elvish', detail: 'Quenya' }],
    });
    expect(chunk.type).toBe('done');
    expect(chunk.detectedLangs).toEqual([{ id: 'arabizi' }, { id: 'elvish', detail: 'Quenya' }]);
  });
});

describe('extractDetectedFields', () => {
  it('chunk values override parsed values when both present', () => {
    const out = extractDetectedFields(
      { detectedLang: 'pa', detectedDetail: 'parsed', explain: 'parsed-explain' },
      { detectedLang: 'cb', detectedDetail: 'chunk', explain: 'chunk-explain' },
    );
    expect(out).toEqual({
      detectedLang: 'cb',
      detectedDetail: 'chunk',
      explain: 'chunk-explain',
    });
  });

  it('falls back to parsed when chunk field absent', () => {
    const out = extractDetectedFields(
      { detectedLang: 'pa', detectedDetail: 'parsed' },
      { explain: 'chunk-explain' },
    );
    expect(out).toEqual({
      detectedLang: 'pa',
      detectedDetail: 'parsed',
      explain: 'chunk-explain',
    });
  });

  it('omits keys when neither source has them (exactOptionalPropertyTypes)', () => {
    const out = extractDetectedFields({}, {});
    expect(out).toEqual({});
    expect('detectedLang' in out).toBe(false);
    expect('detectedDetail' in out).toBe(false);
    expect('detectedLangs' in out).toBe(false);
    expect('explain' in out).toBe(false);
  });

  it('threads detectedLangs', () => {
    const out = extractDetectedFields({}, { detectedLangs: [{ id: 'arabizi' }] });
    expect(out.detectedLangs).toEqual([{ id: 'arabizi' }]);
  });

  it('parsed.detectedLangs wins when chunk lacks it', () => {
    const out = extractDetectedFields({ detectedLangs: [{ id: 'pa' }] }, {});
    expect(out.detectedLangs).toEqual([{ id: 'pa' }]);
  });
});

describe('parseJsonResponse — text a model did not escape', () => {
  // A quote then a comma inside the text read as the end of the string and cut the translation.
  it('keeps a translation with an inner quote followed by a comma', () => {
    const r = parseJsonResponse(
      '{"translation": "He said "yalla", then left", "confidence": 0.8, "detectedLang": "arabizi"}',
    );
    expect(r.translation).toBe('He said "yalla", then left');
    expect(r.confidence).toBe(0.8);
    expect(r.detectedLang).toBe('arabizi');
  });

  // Prose with its own brace before the envelope lost every field but the translation.
  it('finds the envelope after prose that contains a brace', () => {
    const r = parseJsonResponse(
      'Sure! Here is the {translation}: {"translation":"hi","confidence":0.4,"detectedLang":"arabizi"}',
    );
    expect(r).toMatchObject({ translation: 'hi', confidence: 0.4, detectedLang: 'arabizi' });
  });
});
