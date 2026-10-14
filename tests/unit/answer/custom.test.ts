import { beforeEach, describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { storedAnswerSpecSchema } from '@/shared/custom-answer-schema';
import { customAnswerSpec, customAnswerContract } from '@/shared/answer/custom';
import { CARD_CONTRACT, PLAIN_CONTRACT } from '@/shared/answer/formats-v1';
import { cacheKey } from '@/background/cache';
import { addCustomTask, patchCustomTask } from '@/shared/tasks';
import { getCustomTasks } from '@/shared/storage';
import { parseCustomTaskRows } from '@/shared/storage/sanitise';
import { resetChromeMock } from '@tests/mocks/chrome';
import { readAnswer, createAnswerProjector } from '@/shared/answer/reader';
import { toJsonSchema } from '@/shared/answer/json-schema';

const fields = [
  { key: 'answer', label: 'Answer', kind: 'text' as const, role: 'main' as const, required: true },
  {
    key: 'points',
    label: 'Key points',
    kind: 'list' as const,
    role: 'notes' as const,
    required: false,
  },
] as const;
const input = {
  label: 'Review',
  system: 'Review this.',
  user: '{{text}}',
  output: 'plain' as const,
  image: false,
  pageContext: false,
  glossary: false,
};
beforeEach(() => resetChromeMock());

describe('stored custom answer fields', () => {
  it.each(['plain', 'card'] as const)(
    '%s presets use answer consistently and read legacy responses',
    (output) => {
      const spec = customAnswerSpec({ output });
      const contract = customAnswerContract({ output });
      expect(contract).toContain('Return JSON ONLY: {"answer": <your answer as a string>');
      expect(contract).not.toContain('"translation"');
      expect(toJsonSchema(spec)).toMatchObject({
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      });
      expect(toJsonSchema(spec).properties).not.toHaveProperty('translation');
      for (const key of ['answer', 'translation']) {
        expect(
          readAnswer(spec, JSON.stringify({ [key]: 'Useful result', explain: 'A note' })),
        ).toMatchObject({
          kind: 'ok',
          main: 'Useful result',
          fields: { answer: 'Useful result' },
        });
      }
      const projector = createAnswerProjector(spec);
      expect(projector.push('{"answer":"Useful')).toEqual({ text: 'Useful' });
      expect(projector.push(' result"}')).toEqual({ text: ' result' });
      expect(projector.finish()).toMatchObject({ kind: 'ok', main: 'Useful result' });
    },
  );
  it('uses the same contracts for absent and explicit preset specs', () => {
    expect(customAnswerContract({ output: 'plain' })).toBe(PLAIN_CONTRACT);
    expect(customAnswerContract({ output: 'card' })).toBe(CARD_CONTRACT);
    expect(
      customAnswerContract({ output: 'plain', answer: { v: 1, preset: 'answer-notes' } }),
    ).toBe(CARD_CONTRACT);
  });
  it('validates the complete shape without silently dropping invalid fields', () => {
    expect(v.safeParse(storedAnswerSpecSchema, { v: 1, fields }).success).toBe(true);
    for (const invalid of [
      [],
      [...fields, fields[1]],
      [{ ...fields[0], required: false }],
      [{ ...fields[0], role: 'meta' }],
      [{ ...fields[0], key: '__proto__' }],
      [{ ...fields[0], when: 'explain' }],
      [
        ...fields,
        {
          key: 'tone',
          label: 'Tone',
          kind: 'choice',
          role: 'details',
          required: false,
          choices: ['Formal', 'formal'],
        },
      ],
    ])
      expect(v.safeParse(storedAnswerSpecSchema, { v: 1, fields: invalid }).success).toBe(false);
    expect(
      v.safeParse(storedAnswerSpecSchema, { v: 1, fields, preset: 'answer-only' }).success,
    ).toBe(false);
  });
  it('writes the legacy output alongside the fields and preserves fields across ordinary edits', async () => {
    const row = await addCustomTask({ ...input, answer: { v: 1, fields } });
    expect(row.output).toBe('card');
    await patchCustomTask(row.id, { label: 'Renamed' });
    expect((await getCustomTasks())[0]).toMatchObject({
      label: 'Renamed',
      output: 'card',
      answer: { v: 1, fields },
    });
    await patchCustomTask(row.id, { answer: { v: 1, preset: 'answer-only' } });
    expect((await getCustomTasks())[0]?.output).toBe('plain');
  });
  it('keeps unknown spec versions and uses the fallback preset contract', () => {
    const answer = { v: 2, future: ['kept'] };
    expect(v.safeParse(storedAnswerSpecSchema, answer).success).toBe(true);
    const rows = parseCustomTaskRows([{ ...input, id: 'future', createdAt: 1, answer }], 'drop');
    expect(rows[0]).toMatchObject({ answer });
    expect(customAnswerContract({ output: 'plain', answer })).toBe(PLAIN_CONTRACT);
  });
  it('refuses an invalid imported spec and preserves a damaged stored spec', () => {
    const row = { ...input, id: 'bad', createdAt: 1, answer: { v: 1, fields: [] } };
    expect(parseCustomTaskRows([row], 'drop')).toEqual([]);
    expect(parseCustomTaskRows([row], 'keep')[0]).toMatchObject({ answer: row.answer });
  });
  it('leaves a working row when a frozen older strict schema drops answer', () => {
    const old = v.strictObject({
      id: v.string(),
      label: v.string(),
      system: v.string(),
      user: v.string(),
      output: v.picklist(['plain', 'card']),
      pageContext: v.boolean(),
      image: v.boolean(),
      glossary: v.boolean(),
      createdAt: v.number(),
    });
    // The old clamp keeps known fields before its strict parse, just as the saved-row reader did.
    const row = { ...input, id: 'old', createdAt: 1, output: 'card', answer: { v: 1, fields } };
    const known = Object.fromEntries(
      Object.entries(row).filter(([key]) => Object.hasOwn(old.entries, key)),
    );
    const downgraded = v.parse(old, known);
    expect(downgraded).not.toHaveProperty('answer');
    expect(customAnswerContract(downgraded)).toBe(CARD_CONTRACT);
  });
  it('separates cached answers when field presentation changes even with the same prompt', async () => {
    const first = customAnswerSpec({ output: 'plain', answer: { v: 1, fields } });
    const second = { ...first, fields: [fields[0], { ...fields[1], role: 'details' as const }] };
    const prompt = { system: 'same', user: 'same', task: 'custom' };
    expect(await cacheKey({ ...prompt, answerSpec: first })).not.toBe(
      await cacheKey({ ...prompt, answerSpec: second }),
    );
  });
});
