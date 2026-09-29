import type { BrowserContextRef } from './browser';

export const AUDIT_TOOL_DEFS = [
  {
    name: 'audit_read',
    description: 'Read the rolling-50 egaAuditLog from chrome.storage.local (read-only).',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
] as const;

export type AuditDispatchResult = { ok: true; result: unknown } | { ok: false; error: string };

interface ChromeAuditBag {
  chrome?: {
    storage?: {
      local?: {
        get?: (k: string, cb: (v: Record<string, unknown>) => void) => void;
      };
    };
  };
}

export async function dispatchAuditTool(
  ref: BrowserContextRef,
  name: string,
): Promise<AuditDispatchResult> {
  if (name !== 'audit_read') return { ok: false, error: `unknown audit tool ${name}` };
  try {
    const log = await ref.page.evaluate(
      async () =>
        new Promise<unknown>((resolve) => {
          const bag = globalThis as unknown as ChromeAuditBag;
          const get = bag.chrome?.storage?.local?.get;
          if (typeof get === 'function') {
            get('egaAuditLog', (v: Record<string, unknown>) => {
              resolve(v['egaAuditLog'] ?? []);
            });
          } else {
            resolve([]);
          }
        }),
    );
    return { ok: true, result: log };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
