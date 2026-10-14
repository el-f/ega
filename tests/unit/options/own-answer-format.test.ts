import { describe, expect, it } from 'vitest';
import { embedsOwnFormat, convertOwnFormat } from '@/options/own-answer-format';
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
    expect(result.prompt).toEqual({
      system: 'Be concise.  Keep names unchanged.',
      user: '{{text}}',
    });
    expect(result.fields).toEqual([
      { key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true },
      { key: 'keyPoints', label: 'Key points', kind: 'text', role: 'notes', required: false },
      { key: 'tone', label: 'Tone', kind: 'text', role: 'notes', required: false },
    ]);
    expect(prompt.system).toContain('Return JSON');
  });
  it('ignores ambiguous examples, nested shapes, unsafe keys and excessive fields', () => {
    for (const system of [
      'Discuss JSON and {"example": "data"}.',
      'Return JSON {"nested": {"x": 1}}.',
      'Return JSON {"constructor": string}.',
      `Return JSON {${Array.from({ length: 9 }, (_, i) => `"key${i}": string`).join(',')}}.`,
    ]) {
      expect(embedsOwnFormat({ system, user: '{{text}}' })).toBeNull();
    }
  });
});
