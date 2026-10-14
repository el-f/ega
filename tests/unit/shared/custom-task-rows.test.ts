// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUSTOM_TASKS_MAX, parseCustomTaskRows } from '@/shared/storage/sanitise';

afterEach(() => {
  vi.restoreAllMocks();
});

const GOOD = {
  id: 'c1',
  label: 'Tweet',
  system: 'Summarize as one tweet.',
  user: 'TEXT:\n"""\n{{text}}\n"""',
  output: 'plain',
  pageContext: false,
  image: false,
  glossary: false,
  createdAt: 1,
};

describe('parseCustomTaskRows', () => {
  it.each(['keep', 'drop'] as const)(
    'preserves future fields on %s without accepting prototype keys',
    (mode) => {
      const future = { ...GOOD, answer: { v: 2, fields: ['future'] }, answersIn: 'input' };
      const raw = JSON.parse(
        JSON.stringify(future).slice(0, -1) + ',"__proto__":{"polluted":true},"constructor":1}',
      );
      const [row] = parseCustomTaskRows([raw], mode);
      expect(row).toEqual(future);
      expect(Object.hasOwn(row ?? {}, '__proto__')).toBe(false);
      expect(Object.hasOwn(row ?? {}, 'constructor')).toBe(false);
    },
  );
  it('drops a row that fails the schema when importing', () => {
    expect(parseCustomTaskRows([{ ...GOOD, user: 'no slot' }, GOOD], 'drop')).toEqual([GOOD]);
  });

  it('keeps a stored row that fails the schema, filling only the fields it lacks', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [row] = parseCustomTaskRows([{ id: 'c1', label: 'Tweet', createdAt: 5 }], 'keep');
    expect(row).toEqual({
      id: 'c1',
      label: 'Tweet',
      createdAt: 5,
      system: '',
      user: 'TEXT:\n"""\n{{text}}\n"""',
      output: 'plain',
      pageContext: false,
      image: false,
      glossary: false,
    });
  });

  it('keeps the fields a stored row that fails the schema already has', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stored = { ...GOOD, user: 'no slot', system: 'mine', pageContext: true, glossary: true };
    expect(parseCustomTaskRows([stored], 'keep')).toEqual([stored]);
  });

  it('keeps an output value a newer build wrote', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [row] = parseCustomTaskRows([{ ...GOOD, output: 'table' }], 'keep');
    expect(row?.output).toBe('table');
  });

  it('drops a row that takes a built-in id or repeats an earlier id', () => {
    const rows = parseCustomTaskRows(
      [{ ...GOOD, id: 'summarize' }, GOOD, { ...GOOD, label: 'Second' }],
      'drop',
    );
    expect(rows.map((r) => [r.id, r.label])).toEqual([['c1', 'Tweet']]);
  });

  it('reads no more than the cap', () => {
    const many = Array.from({ length: CUSTOM_TASKS_MAX + 5 }, (_, i) => ({ ...GOOD, id: `c${i}` }));
    expect(parseCustomTaskRows(many, 'drop')).toHaveLength(CUSTOM_TASKS_MAX);
  });
});
