import { describe, expect, it } from 'vitest';
import { embedsOwnFormat, convertOwnFormat, takeOutOwnFormat } from '@/options/own-answer-format';
import { TASK_FORMATS } from '@/shared/answer/formats-v1';
import { validateSpec } from '@/shared/answer/spec';
import { fieldErrors } from '@/options/answer-fields';

function convert(system: string, user = '{{text}}') {
  const prompt = { system, user };
  const own = embedsOwnFormat(prompt);
  if (!own) throw new Error('no format');
  return convertOwnFormat(prompt, own);
}

describe('a prompt with its own answer format', () => {
  it('converts only the explicit format sentence and retains instructions and variables', () => {
    const prompt = {
      system:
        'Be concise. Return JSON {"answer": string, "keyPoints": string, "tone": string}. Keep names unchanged.',
      user: '{{text}}',
    };
    const own = embedsOwnFormat(prompt);
    expect(own?.keys).toEqual(['answer', 'keyPoints', 'tone']);
    if (!own) throw new Error('no format');
    const result = convertOwnFormat(prompt, own);
    expect(result?.prompt).toEqual({
      system: 'Be concise.  Keep names unchanged.',
      user: '{{text}}',
    });
    expect(result?.fields).toEqual([
      { key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true },
      { key: 'keyPoints', label: 'Key points', kind: 'text', role: 'notes', required: true },
      { key: 'tone', label: 'Tone', kind: 'text', role: 'notes', required: true },
    ]);
    expect(prompt.system).toContain('Return JSON');
  });

  it('keeps the first key as the answer and each placeholder as its guide', () => {
    const result = convert(
      'Rewrite it. Return JSON: {"result": <the rewrite>, "why": <one reason>}.',
    );
    expect(result?.prompt.system).toBe('Rewrite it.');
    expect(result?.fields).toEqual([
      {
        key: 'result',
        label: 'Result',
        kind: 'text',
        role: 'main',
        required: true,
        guide: 'the rewrite',
      },
      {
        key: 'why',
        label: 'Why',
        kind: 'text',
        role: 'notes',
        required: true,
        guide: 'one reason',
      },
    ]);
  });

  it('a value that is an array or says list becomes a list field', () => {
    const result = convert(
      'Read it. Return JSON {"summary": <two sentences>, "tags": <array of 3 keywords>, "steps": ["..."]}.',
    );
    expect(result?.fields.map((f) => [f.key, f.kind, f.role, f.guide])).toEqual([
      ['summary', 'text', 'main', 'two sentences'],
      ['tags', 'list', 'notes', '3 keywords'],
      ['steps', 'list', 'notes', undefined],
    ]);
  });

  it('answer or translation stays the main field wherever it sits', () => {
    const result = convert('Do it. Return JSON {"why": string, "translation": "<the text>"}.');
    expect(result?.fields.map((f) => [f.key, f.role, f.guide])).toEqual([
      ['answer', 'main', 'the text'],
      ['why', 'notes', undefined],
    ]);
  });

  it('a field under a key Ega reads for itself gets a free key', () => {
    const result = convert('Do it. Return JSON {"summary": string, "text": string}.');
    expect(result?.fields.map((f) => f.key)).toEqual(['summary', 'text2']);
    expect(
      validateSpec({
        id: 'custom:t',
        version: 1,
        join: 'after-build',
        fields: result?.fields ?? [],
      }),
    ).toEqual([]);
  });

  it('a first key Ega keeps for notes is not the main key; the answer key is', () => {
    const result = convert('Rewrite it. Return JSON: {"explain": <why>, "result": <the rewrite>}.');
    expect(result?.fields.map((f) => [f.key, f.role])).toEqual([
      ['answer', 'main'],
      ['result2', 'notes'],
    ]);
    expect(fieldErrors(result?.fields ?? []).size).toBe(0);
  });

  it('refuses when the format is the whole of its half', () => {
    expect(convert('Return JSON {"answer": string, "tags": string}.')).toBeNull();
  });

  it('ignores ambiguous examples, nested shapes, unsafe keys and excessive fields', () => {
    for (const system of [
      'Discuss JSON and {"example": "data"}.',
      'Return JSON {"nested": {"x": 1}}.',
      'Return JSON {"constructor": string}.',
      'Return JSON {"answer": string, "confidence": number}.',
      `Return JSON {${Array.from({ length: 9 }, (_, i) => `"key${i}": string`).join(',')}}.`,
    ]) {
      expect(embedsOwnFormat({ system, user: '{{text}}' })).toBeNull();
    }
  });
});

describe("Use Ega's format", () => {
  const format = TASK_FORMATS.summarize;

  it('cuts only the format sentence, never the instruction that shares its line', () => {
    const prompt = {
      system:
        'Summarize the text in 1-3 sentences. Return JSON ONLY: {"summary": <string>}.\nWrite it in {{targetLangLabel}}.',
      user: '{{text}}',
    };
    expect(takeOutOwnFormat(prompt, format)).toEqual({
      system: 'Summarize the text in 1-3 sentences.\nWrite it in {{targetLangLabel}}.',
      user: '{{text}}',
    });
  });

  it("takes out Ega's own format bytes first, then a line that holds only the format", () => {
    expect(
      takeOutOwnFormat({ system: `Summarize it. ${format.text}`, user: '{{text}}' }, format),
    ).toEqual({ system: 'Summarize it.', user: '{{text}}' });
    expect(
      takeOutOwnFormat(
        { system: 'Summarize it.\nReturn JSON ONLY: {"summary": {"nested": 1}}', user: '{{text}}' },
        format,
      ),
    ).toEqual({ system: 'Summarize it.', user: '{{text}}' });
  });
});
