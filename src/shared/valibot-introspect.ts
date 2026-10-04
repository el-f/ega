// Read-only walk over valibot's schema objects. Valibot exposes no public introspection, so every
// reader of `.entries` / `.wrapped` / `.pipe` goes through here and a valibot rename breaks one file.
import type * as v from 'valibot';

export type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

export interface PipeAction {
  type: string;
  requirement?: unknown;
}

export interface SchemaNode {
  type?: string;
  pipe?: readonly PipeAction[];
  entries?: Record<string, AnySchema>;
  item?: AnySchema;
  key?: AnySchema;
  value?: AnySchema;
  options?: readonly AnySchema[];
  wrapped?: AnySchema;
  default?: unknown;
}

export const WRAPPER_TYPES: ReadonlySet<string> = new Set([
  'optional',
  'exact_optional',
  'nullable',
  'nullish',
  'undefinedable',
]);

const MAX_DEPTH = 8;

/** Peels optional/nullable wrappers and stops; the returned node keeps its `pipe`, so bounds stay readable. */
export function unwrapOptional(schema: AnySchema): SchemaNode {
  let cur = schema as SchemaNode;
  for (let i = 0; i < MAX_DEPTH; i += 1) {
    if (!cur.wrapped || !WRAPPER_TYPES.has(cur.type ?? '')) break;
    cur = cur.wrapped as SchemaNode;
  }
  return cur;
}

/** The `entries` of an object schema behind any wrappers and pipes, or undefined for a non-object. */
export function objectEntries(node: unknown): Record<string, AnySchema> | undefined {
  let cur: unknown = node;
  for (let i = 0; i < MAX_DEPTH; i += 1) {
    if (cur === null || typeof cur !== 'object') return undefined;
    const obj = cur as SchemaNode;
    if (obj.entries && typeof obj.entries === 'object') return obj.entries;
    // `v.pipe(base, ...actions)` copies the base and keeps it at pipe[0].
    if (Array.isArray(obj.pipe) && obj.pipe.length > 0) {
      cur = obj.pipe[0];
      continue;
    }
    if (obj.wrapped !== undefined) {
      cur = obj.wrapped;
      continue;
    }
    return undefined;
  }
  return undefined;
}
