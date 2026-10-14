import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pushAuditEntry, readAuditLog } from '@/shared/audit-log';
import { asBackendIdUnsafe } from '@/shared/brands';

const localStore = new Map<string, unknown>();
let rejectNextSet = false;

function entry(userPrompt: string) {
  return {
    task: 'translate' as const,
    sourceLang: 'ar',
    targetLang: 'en',
    backend: asBackendIdUnsafe('openai'),
    model: 'm',
    systemPrompt: 's',
    userPrompt,
    response: 'r',
    latencyMs: 1,
    cacheHit: false,
  };
}

beforeEach(() => {
  localStore.clear();
  rejectNextSet = false;
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (key: string | string[]) => {
          const k = Array.isArray(key) ? (key[0] ?? '') : key;
          return Promise.resolve({ [k]: localStore.get(k) });
        },
        set: (entries: Record<string, unknown>) => {
          if (rejectNextSet) {
            rejectNextSet = false;
            return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
          }
          for (const [k, v] of Object.entries(entries)) localStore.set(k, v);
          return Promise.resolve();
        },
        remove: (key: string) => {
          localStore.delete(key);
          return Promise.resolve();
        },
      },
    },
    runtime: { sendMessage: vi.fn(() => Promise.resolve()) },
  });
});

describe('a rejected audit write does not eat the batch', () => {
  it('carries the drained entries into the next push', async () => {
    rejectNextSet = true;
    await expect(pushAuditEntry(entry('first'))).rejects.toThrow(/quota/i);

    await pushAuditEntry(entry('second'));

    const prompts = (await readAuditLog()).map((e) => e.userPrompt);
    expect(prompts).toContain('first');
    expect(prompts).toContain('second');
  });
});
