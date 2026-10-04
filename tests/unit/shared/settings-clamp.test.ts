import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { clampToSchema, isPlainObject, PROTO_KEYS } from '@/shared/settings-clamp';
import type { AnySchema } from '@/shared/valibot-introspect';

/** Runs the clamp and returns the value together with the dropped-path list. */
function clamp(schema: AnySchema, value: unknown): { out: unknown; dropped: string[] } {
  const dropped: string[] = [];
  return { out: clampToSchema(schema, value, dropped), dropped };
}

/** Own `__proto__`/`constructor`/`prototype` keys only exist on a parsed payload, never an object literal. */
const hostile = (extra = ''): unknown =>
  JSON.parse(
    `{"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}${extra}}`,
  );

describe('PROTO_KEYS', () => {
  it('names exactly the three prototype-reaching keys', () => {
    expect([...PROTO_KEYS].sort()).toEqual(['__proto__', 'constructor', 'prototype']);
  });
});

describe('isPlainObject', () => {
  it.each([
    [{}, true],
    [{ a: 1 }, true],
    [[], false],
    [null, false],
    ['s', false],
    [1, false],
    [undefined, false],
  ])('%j -> %s', (input, expected) => {
    expect(isPlainObject(input)).toBe(expected);
  });
});

describe('clampToSchema — prototype keys', () => {
  const schemas: [string, AnySchema][] = [
    ['record', v.record(v.string(), v.any())],
    ['object', v.object({ ok: v.string() })],
    ['looseObject', v.looseObject({ ok: v.string() })],
    ['strictObject', v.strictObject({ ok: v.string() })],
  ];

  it.each(schemas)('%s never lets a proto key into the output', (_name, schema) => {
    const { out } = clamp(schema, hostile(',"ok":"fine"'));
    const result = out as Record<string, unknown>;
    expect(Object.keys(result)).toEqual(['ok']);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, 'polluted')).toBe(false);
    expect((result as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it.each(schemas)('%s leaves Object.prototype untouched', (_name, schema) => {
    clamp(schema, hostile(',"ok":"fine"'));
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it.each(['__proto__', 'constructor', 'prototype'])('record drops a lone %s key', (key) => {
    const payload = JSON.parse(`{"${key}":{"polluted":true}}`);
    const { out } = clamp(v.record(v.string(), v.any()), payload);
    expect(Object.keys(out as object)).toEqual([]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it.each(['__proto__', 'constructor', 'prototype'])('looseObject drops a lone %s key', (key) => {
    const payload = JSON.parse(`{"${key}":{"polluted":true}}`);
    const { out } = clamp(v.looseObject({}), payload);
    expect(Object.keys(out as object)).toEqual([]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('a proto key is skipped silently, not reported as a dropped path', () => {
    const { dropped } = clamp(v.record(v.string(), v.any()), hostile());
    expect(dropped).toEqual([]);
  });
});

describe('clampToSchema — string', () => {
  const schema = v.pipe(v.string(), v.maxLength(3));

  it('truncates a string past max_length', () => {
    expect(clamp(schema, 'abcdef').out).toBe('abc');
  });

  it('keeps a string at or under max_length', () => {
    expect(clamp(schema, 'abc').out).toBe('abc');
    expect(clamp(schema, 'ab').out).toBe('ab');
  });

  it('keeps any length when the schema has no max_length', () => {
    expect(clamp(v.string(), 'abcdef').out).toBe('abcdef');
  });

  it('passes a non-string through unchanged', () => {
    expect(clamp(schema, 42).out).toBe(42);
  });

  it('sees through an optional wrapper', () => {
    expect(clamp(v.optional(schema), 'abcdef').out).toBe('abc');
  });
});

describe('clampToSchema — number', () => {
  const both = v.pipe(v.number(), v.minValue(1), v.maxValue(10));

  it('raises a value below min_value to min_value', () => {
    expect(clamp(both, -5).out).toBe(1);
  });

  it('lowers a value above max_value to max_value', () => {
    expect(clamp(both, 99).out).toBe(10);
  });

  it('keeps in-range and boundary values', () => {
    expect(clamp(both, 5).out).toBe(5);
    expect(clamp(both, 1).out).toBe(1);
    expect(clamp(both, 10).out).toBe(10);
  });

  it('keeps a value when only max_value exists', () => {
    const schema = v.pipe(v.number(), v.maxValue(10));
    expect(clamp(schema, 5).out).toBe(5);
    expect(clamp(schema, -100).out).toBe(-100);
    expect(clamp(schema, 11).out).toBe(10);
  });

  it('keeps a value when only min_value exists', () => {
    const schema = v.pipe(v.number(), v.minValue(1));
    expect(clamp(schema, 5).out).toBe(5);
    expect(clamp(schema, 1000).out).toBe(1000);
    expect(clamp(schema, 0).out).toBe(1);
  });

  it('keeps any value when the schema has no bounds', () => {
    expect(clamp(v.number(), -7).out).toBe(-7);
  });

  it.each([NaN, Infinity, -Infinity])('leaves %s alone', (value) => {
    expect(clamp(both, value).out).toBe(value);
  });

  it('passes a non-number through unchanged', () => {
    expect(clamp(both, '5').out).toBe('5');
  });
});

describe('clampToSchema — array', () => {
  it('keeps valid items and reports a dropped index with its bracket path', () => {
    const { out, dropped } = clamp(v.array(v.string()), ['a', 1, 'b', null]);
    expect(out).toEqual(['a', 'b']);
    expect(dropped).toEqual(['[1]', '[3]']);
  });

  it('reports no drops for an all-valid array', () => {
    const { out, dropped } = clamp(v.array(v.string()), ['a', 'b']);
    expect(out).toEqual(['a', 'b']);
    expect(dropped).toEqual([]);
  });

  it('clamps each item before testing it', () => {
    const schema = v.array(v.pipe(v.string(), v.maxLength(2)));
    expect(clamp(schema, ['abc', 'd']).out).toEqual(['ab', 'd']);
  });

  it('caps the kept items at max_length', () => {
    const schema = v.pipe(v.array(v.string()), v.maxLength(2));
    expect(clamp(schema, ['a', 'b', 'c', 'd']).out).toEqual(['a', 'b']);
  });

  it('counts only kept items toward max_length', () => {
    const schema = v.pipe(v.array(v.string()), v.maxLength(2));
    const { out, dropped } = clamp(schema, [1, 'a', 2, 'b', 'c']);
    expect(out).toEqual(['a', 'b']);
    expect(dropped).toEqual(['[0]', '[2]']);
  });

  it('hands back the input when every entry is invalid', () => {
    const input = [1, 2, 3];
    const { out, dropped } = clamp(v.array(v.string()), input);
    expect(out).toBe(input);
    expect(dropped).toEqual(['[0]', '[1]', '[2]']);
  });

  it('returns a fresh empty array for an empty input', () => {
    const input: unknown[] = [];
    const { out } = clamp(v.array(v.string()), input);
    expect(out).toEqual([]);
    expect(out).not.toBe(input);
  });

  it('passes a non-array through unchanged', () => {
    expect(clamp(v.array(v.string()), 'x').out).toBe('x');
  });

  it('prefixes the parent path on nested drops', () => {
    const { dropped } = clamp(v.object({ list: v.array(v.string()) }), { list: ['a', 2] });
    expect(dropped).toEqual(['list[1]']);
  });

  it('keeps every entry when the array schema has no item schema', () => {
    const schema = { type: 'array' } as unknown as AnySchema;
    expect(clamp(schema, [1, 'a', null]).out).toEqual([1, 'a', null]);
  });
});

describe('clampToSchema — record', () => {
  it('caps a record at max_entries', () => {
    const schema = v.pipe(v.record(v.string(), v.string()), v.maxEntries(2));
    const { out } = clamp(schema, { a: '1', b: '2', c: '3', d: '4' });
    expect(out).toEqual({ a: '1', b: '2' });
  });

  it('keeps a record at exactly max_entries', () => {
    const schema = v.pipe(v.record(v.string(), v.string()), v.maxEntries(2));
    expect(clamp(schema, { a: '1', b: '2' }).out).toEqual({ a: '1', b: '2' });
  });

  it('counts only kept entries toward max_entries', () => {
    const schema = v.pipe(v.record(v.string(), v.string()), v.maxEntries(2));
    const { out, dropped } = clamp(schema, { a: 1, b: '2', c: '3', d: '4' });
    expect(out).toEqual({ b: '2', c: '3' });
    expect(dropped).toEqual(['a']);
  });

  it('does not cap a record without max_entries', () => {
    const input = { a: '1', b: '2', c: '3', d: '4' };
    expect(clamp(v.record(v.string(), v.string()), input).out).toEqual(input);
  });

  it('drops an entry whose key fails the key schema', () => {
    const schema = v.record(v.picklist(['a', 'b']), v.string());
    const { out, dropped } = clamp(schema, { a: '1', zzz: '2', b: '3' });
    expect(out).toEqual({ a: '1', b: '3' });
    expect(dropped).toEqual(['zzz']);
  });

  it('clamps entry values before testing them', () => {
    const schema = v.record(v.string(), v.pipe(v.number(), v.maxValue(5)));
    expect(clamp(schema, { a: 9, b: 2 }).out).toEqual({ a: 5, b: 2 });
  });

  it('drops an entry the value schema cannot accept, with its dotted path', () => {
    const schema = v.object({ m: v.record(v.string(), v.string()) });
    const { dropped } = clamp(schema, { m: { k: 1, ok: 'x' } });
    expect(dropped).toEqual(['m.k']);
  });

  it('passes a non-object (or an array) through unchanged', () => {
    const schema = v.record(v.string(), v.string());
    expect(clamp(schema, 'x').out).toBe('x');
    const arr = ['a'];
    expect(clamp(schema, arr).out).toBe(arr);
    expect(clamp(schema, null).out).toBeNull();
  });

  it('keeps values untouched when the record schema has no value schema', () => {
    const schema = { type: 'record', key: v.string() } as unknown as AnySchema;
    expect(clamp(schema, { a: 1, b: 'x' }).out).toEqual({ a: 1, b: 'x' });
  });
});

describe('clampToSchema — object kinds', () => {
  it.each([
    ['object', v.object({ a: v.string() })],
    ['strict_object', v.strictObject({ a: v.string() })],
  ])('drops an unknown key from a %s, naming its path', (_name, schema) => {
    const { out, dropped } = clamp(schema, { a: 'x', extra: 1 });
    expect(out).toEqual({ a: 'x' });
    expect(dropped).toEqual(['extra']);
  });

  it('keeps an unknown key on a loose_object', () => {
    const { out, dropped } = clamp(v.looseObject({ a: v.string() }), { a: 'x', extra: 1 });
    expect(out).toEqual({ a: 'x', extra: 1 });
    expect(dropped).toEqual([]);
  });

  it('clamps declared fields of a loose_object', () => {
    const schema = v.looseObject({ a: v.pipe(v.string(), v.maxLength(1)) });
    expect(clamp(schema, { a: 'xyz', extra: 1 }).out).toEqual({ a: 'x', extra: 1 });
  });

  it('prefixes the parent path on a nested unknown key', () => {
    const schema = v.object({ outer: v.object({ a: v.string() }) });
    const { dropped } = clamp(schema, { outer: { a: 'x', stray: 1 } });
    expect(dropped).toEqual(['outer.stray']);
  });

  it('drops an optional field no clamp can save, so its default fills in', () => {
    const schema = v.object({ a: v.optional(v.string(), 'dflt') });
    const { out, dropped } = clamp(schema, { a: 123 });
    expect(out).toEqual({});
    expect(dropped).toEqual(['a']);
  });

  it('keeps an optional field that already fits', () => {
    const schema = v.object({ a: v.optional(v.string(), 'dflt') });
    const { out, dropped } = clamp(schema, { a: 'mine' });
    expect(out).toEqual({ a: 'mine' });
    expect(dropped).toEqual([]);
  });

  it('keeps a required field the clamp cannot save, unchanged', () => {
    const { out, dropped } = clamp(v.object({ a: v.string() }), { a: 123 });
    expect(out).toEqual({ a: 123 });
    expect(dropped).toEqual([]);
  });

  it('keeps a required field of the right value after clamping', () => {
    const schema = v.object({ n: v.pipe(v.number(), v.maxValue(3)) });
    expect(clamp(schema, { n: 8 }).out).toEqual({ n: 3 });
  });

  it('passes a non-object through unchanged', () => {
    const schema = v.object({ a: v.string() });
    expect(clamp(schema, 'x').out).toBe('x');
    expect(clamp(schema, null).out).toBeNull();
    const arr: unknown[] = [];
    expect(clamp(schema, arr).out).toBe(arr);
  });

  it('treats a hand-built object node with no entries as having none', () => {
    const schema = { type: 'strict_object' } as unknown as AnySchema;
    const { out, dropped } = clamp(schema, { a: 1 });
    expect(out).toEqual({});
    expect(dropped).toEqual(['a']);
  });

  it('starts the dropped path at the root when no path is given', () => {
    const dropped: string[] = [];
    clampToSchema(v.object({ a: v.string() }), { stray: 1 }, dropped);
    expect(dropped).toEqual(['stray']);
  });

  it('joins onto a caller-supplied path', () => {
    const dropped: string[] = [];
    clampToSchema(v.object({ a: v.string() }), { stray: 1 }, dropped, 'base');
    expect(dropped).toEqual(['base.stray']);
  });
});

describe('clampToSchema — union and variant', () => {
  it('returns the clamp of the first option that fits afterwards', () => {
    const schema = v.union([v.number(), v.pipe(v.string(), v.maxLength(3))]);
    expect(clamp(schema, 'abcdef').out).toBe('abc');
  });

  it('prefers the first option that fits', () => {
    const schema = v.union([
      v.pipe(v.string(), v.maxLength(2)),
      v.pipe(v.string(), v.maxLength(4)),
    ]);
    expect(clamp(schema, 'abcdef').out).toBe('ab');
  });

  it('returns the input unchanged when no option can fit', () => {
    const schema = v.union([v.number(), v.boolean()]);
    expect(clamp(schema, 'text').out).toBe('text');
  });

  it('reports drops only from the option that won', () => {
    const schema = v.union([v.strictObject({ a: v.number() }), v.strictObject({ a: v.string() })]);
    const { out, dropped } = clamp(schema, { a: 'x', z: 1 });
    expect(out).toEqual({ a: 'x' });
    expect(dropped).toEqual(['z']);
  });

  it('reports no drops when the winning option dropped nothing', () => {
    const { out, dropped } = clamp(v.union([v.string(), v.number()]), 5);
    expect(out).toBe(5);
    expect(dropped).toEqual([]);
  });

  it('keeps the parent path on an option drop', () => {
    const schema = v.object({
      u: v.union([v.strictObject({ a: v.string() }), v.strictObject({ b: v.string() })]),
    });
    const { dropped } = clamp(schema, { u: { a: 'x', stray: 1 } });
    expect(dropped).toEqual(['u.stray']);
  });

  it('clamps through a variant', () => {
    const schema = v.variant('kind', [
      v.object({ kind: v.literal('s'), text: v.pipe(v.string(), v.maxLength(2)) }),
      v.object({ kind: v.literal('n'), num: v.pipe(v.number(), v.maxValue(5)) }),
    ]);
    expect(clamp(schema, { kind: 'n', num: 50 }).out).toEqual({ kind: 'n', num: 5 });
    expect(clamp(schema, { kind: 's', text: 'abc' }).out).toEqual({ kind: 's', text: 'ab' });
  });

  it('treats a hand-built union with no options as unfittable', () => {
    const schema = { type: 'union' } as unknown as AnySchema;
    expect(clamp(schema, 'x').out).toBe('x');
  });
});

describe('clampToSchema — other schema types', () => {
  it('returns the value as-is for a schema type it does not bend', () => {
    expect(clamp(v.boolean(), 'nope').out).toBe('nope');
    expect(clamp(v.literal('a'), 'b').out).toBe('b');
  });

  it('returns the value as-is for a node without a type', () => {
    expect(clamp({} as unknown as AnySchema, 'x').out).toBe('x');
  });
});
