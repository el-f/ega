import type { BrowserContextRef } from './browser';

export const ASSERT_TOOL_DEFS = [
  {
    name: 'assert',
    description:
      'Assert a predicate about the current page state. Failures become candidate findings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        predicate: {
          type: 'string' as const,
          description: 'JavaScript expression evaluated in the active page; must return truthy.',
        },
        claim: {
          type: 'string' as const,
          description: 'Human description of what is being claimed.',
        },
      },
      required: ['predicate', 'claim'],
    },
  },
] as const;

export interface AssertResult {
  passed: boolean;
  predicate: string;
  claim: string;
  observed?: unknown;
}

export type AssertDispatchResult =
  { ok: true; result: AssertResult } | { ok: false; error: string };

export async function dispatchAssertTool(
  ref: BrowserContextRef,
  name: string,
  input: Record<string, unknown>,
): Promise<AssertDispatchResult> {
  if (name !== 'assert') return { ok: false, error: `unknown assert tool ${name}` };
  const predicate = typeof input['predicate'] === 'string' ? input['predicate'] : undefined;
  const claim = typeof input['claim'] === 'string' ? input['claim'] : undefined;
  if (predicate === undefined || claim === undefined) {
    return { ok: false, error: 'assert requires predicate + claim' };
  }
  try {
    // The predicate runs in the page via new Function: it sees page globals, never Node.
    const observed: unknown = await ref.page.evaluate((p: string) => {
      const fn = new Function(`return (${p})`) as () => unknown;
      const v = fn();
      // Coerce DOM nodes / non-clonable values to a printable shape for the
      // transcript. The agent only needs the truthiness verdict.
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return JSON.parse(JSON.stringify({ truthy: true })) as unknown;
      return v;
    }, predicate);
    return {
      ok: true,
      result: { passed: Boolean(observed), predicate, claim, observed },
    };
  } catch (e) {
    return {
      ok: true,
      result: {
        passed: false,
        predicate,
        claim,
        observed: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
