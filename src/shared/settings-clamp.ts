/** Bends a stored value to fit its schema (clamp caps, drop bad entries, strip unknown keys); read path only. */
import * as v from 'valibot';
import {
  unwrapOptional as unwrap,
  WRAPPER_TYPES,
  type AnySchema,
  type SchemaNode,
} from './valibot-introspect';

export const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// `v.pipe(base, ...actions)` copies the base schema and hangs the actions off `.pipe`.
function bound(node: SchemaNode, action: string): number | undefined {
  const found = node.pipe?.find((a) => a.type === action);
  return typeof found?.requirement === 'number' ? found.requirement : undefined;
}

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function fits(schema: AnySchema, value: unknown): boolean {
  return v.safeParse(schema, value).success;
}

function join(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

/** A value the schema accepts when clamping can get there, else the input unchanged; dropped lists what was discarded. */
export function clampToSchema(
  schema: AnySchema,
  value: unknown,
  dropped: string[] = [],
  path = '',
): unknown {
  const node = unwrap(schema);

  switch (node.type ?? '') {
    case 'string': {
      if (typeof value !== 'string') return value;
      const max = bound(node, 'max_length');
      return max !== undefined && value.length > max ? value.slice(0, max) : value;
    }

    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return value;
      const min = bound(node, 'min_value');
      const max = bound(node, 'max_value');
      if (min !== undefined && value < min) return min;
      if (max !== undefined && value > max) return max;
      return value;
    }

    case 'array': {
      if (!Array.isArray(value)) return value;
      const item = node.item;
      const max = bound(node, 'max_length');
      const kept: unknown[] = [];
      for (let i = 0; i < value.length; i += 1) {
        if (max !== undefined && kept.length >= max) break;
        if (!item) {
          kept.push(value[i]);
          continue;
        }
        const clamped = clampToSchema(item, value[i], dropped, join(path, i));
        if (fits(item, clamped)) kept.push(clamped);
        else dropped.push(join(path, i));
      }
      // Losing every entry is deletion, not degradation — hand the field back so the shipped default wins.
      if (kept.length === 0 && value.length > 0) return value;
      return kept;
    }

    case 'record': {
      if (!isPlainObject(value)) return value;
      const max = bound(node, 'max_entries');
      const out: Record<string, unknown> = {};
      let count = 0;
      for (const [key, val] of Object.entries(value)) {
        if (PROTO_KEYS.has(key)) continue;
        if (max !== undefined && count >= max) break;
        if (node.key && !fits(node.key, key)) {
          dropped.push(join(path, key));
          continue;
        }
        const clamped = node.value ? clampToSchema(node.value, val, dropped, join(path, key)) : val;
        if (node.value && !fits(node.value, clamped)) {
          dropped.push(join(path, key));
          continue;
        }
        out[key] = clamped;
        count += 1;
      }
      return out;
    }

    case 'object':
    case 'strict_object':
    case 'loose_object': {
      if (!isPlainObject(value)) return value;
      const entries = node.entries ?? {};
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        if (PROTO_KEYS.has(key)) continue;
        if (!Object.hasOwn(entries, key)) {
          if (node.type === 'loose_object') out[key] = val;
          else dropped.push(join(path, key));
          continue;
        }
        const field = entries[key] as AnySchema;
        const clamped = clampToSchema(field, val, dropped, join(path, key));
        // An optional field no clamp can save is dropped so its own default fills in.
        if (WRAPPER_TYPES.has((field as SchemaNode).type ?? '') && !fits(field, clamped)) {
          dropped.push(join(path, key));
          continue;
        }
        out[key] = clamped;
      }
      return out;
    }

    case 'union':
    case 'variant': {
      for (const option of node.options ?? []) {
        const optionDropped: string[] = [];
        const clamped = clampToSchema(option, value, optionDropped, path);
        if (fits(option, clamped)) {
          dropped.push(...optionDropped);
          return clamped;
        }
      }
      return value;
    }

    default:
      return value;
  }
}
