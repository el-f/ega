import type { BrowserContextRef, ToolDispatchResult } from './browser';

export const STORAGE_TOOL_DEFS = [
  {
    name: 'storage_read',
    description: 'Read a key from chrome.storage.local in the test profile.',
    input_schema: {
      type: 'object' as const,
      properties: { key: { type: 'string' as const } },
      required: ['key'],
    },
  },
  {
    name: 'storage_write',
    description: 'Write a JSON-serializable value to chrome.storage.local in the test profile.',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string' as const },
        // Any JSON shape, written raw; only ega.settings is sanitized, and only when getSettings reads it.
        value: {},
      },
      required: ['key', 'value'],
    },
  },
] as const;

export type StorageDispatchResult = { ok: true; result: unknown } | { ok: false; error: string };

interface ChromeStorageBag {
  chrome?: {
    storage?: {
      local?: {
        get?: (k: string, cb: (v: Record<string, unknown>) => void) => void;
        set?: (entries: Record<string, unknown>, cb: () => void) => void;
      };
    };
  };
}

export async function dispatchStorageTool(
  ref: BrowserContextRef,
  name: string,
  input: Record<string, unknown>,
): Promise<StorageDispatchResult> {
  try {
    if (name === 'storage_read') {
      const key = typeof input['key'] === 'string' ? input['key'] : undefined;
      if (key === undefined) return { ok: false, error: 'storage_read requires key' };
      const val = await ref.page.evaluate(
        async (k: string) =>
          new Promise<unknown>((resolve) => {
            const bag = globalThis as unknown as ChromeStorageBag;
            const get = bag.chrome?.storage?.local?.get;
            if (typeof get === 'function') {
              get(k, (v: Record<string, unknown>) => {
                resolve(v[k] ?? null);
              });
            } else {
              resolve(null);
            }
          }),
        key,
      );
      return { ok: true, result: val };
    }
    if (name === 'storage_write') {
      const key = typeof input['key'] === 'string' ? input['key'] : undefined;
      if (key === undefined) return { ok: false, error: 'storage_write requires key' };
      // Value comes through as serializable JSON — Playwright will throw if not.
      await ref.page.evaluate(
        async (payload: { k: string; v: unknown }) =>
          new Promise<void>((resolve) => {
            const bag = globalThis as unknown as ChromeStorageBag;
            const set = bag.chrome?.storage?.local?.set;
            if (typeof set === 'function') {
              set({ [payload.k]: payload.v }, () => {
                resolve();
              });
            } else {
              resolve();
            }
          }),
        { k: key, v: input['value'] ?? null },
      );
      return { ok: true, result: 'written' };
    }
    return { ok: false, error: `unknown storage tool ${name}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Re-export so callers don't need to think about the difference.
export type { ToolDispatchResult };
