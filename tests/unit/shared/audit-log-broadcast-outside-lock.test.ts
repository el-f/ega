import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pushAuditEntry, type AuditEntry } from '@/shared/audit-log';
import { asBackendIdUnsafe } from '@/shared/brands';

// A broadcast inside the lock holds it open while Chrome wakes the service worker.

const localStore = new Map<string, unknown>();

const callLog: string[] = [];

beforeEach(() => {
  localStore.clear();
  callLog.length = 0;
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (key: string | string[]) => {
          const k = Array.isArray(key) ? (key[0] ?? '') : key;
          return Promise.resolve({ [k]: localStore.get(k) });
        },
        set: (entries: Record<string, unknown>) => {
          callLog.push('storage.set');
          for (const [k, v] of Object.entries(entries)) localStore.set(k, v);
          return Promise.resolve();
        },
        remove: (key: string) => {
          localStore.delete(key);
          return Promise.resolve();
        },
      },
    },
    runtime: {
      sendMessage: vi.fn(() => {
        callLog.push('runtime.sendMessage');
        return Promise.resolve();
      }),
    },
  });
});

const errorSample: Omit<AuditEntry, 'id' | 'ts'> = {
  task: 'translate',
  sourceLang: 'arabizi',
  targetLang: 'en',
  backend: asBackendIdUnsafe('anthropic'),
  model: 'claude-haiku-4-5',
  systemPrompt: 'sys',
  userPrompt: 'usr',
  response: '',
  latencyMs: 234,
  cacheHit: false,
  error: { code: 'NETWORK', message: 'boom' },
};

describe('audit-log — broadcast fires outside lock window', () => {
  it('chrome.runtime.sendMessage runs AFTER chrome.storage.local.set completes', async () => {
    await pushAuditEntry(errorSample);
    const storageIdx = callLog.indexOf('storage.set');
    const broadcastIdx = callLog.indexOf('runtime.sendMessage');
    expect(storageIdx).toBeGreaterThanOrEqual(0);
    expect(broadcastIdx).toBeGreaterThanOrEqual(0);
    expect(broadcastIdx).toBeGreaterThan(storageIdx);
  });

  it('success-path entries do NOT broadcast (toaster noise guard)', async () => {
    const successSample: Omit<AuditEntry, 'id' | 'ts'> = {
      ...errorSample,
      response: 'hi',
    };
    delete (successSample as { error?: unknown }).error;
    await pushAuditEntry(successSample);
    expect(callLog).toContain('storage.set');
    expect(callLog).not.toContain('runtime.sendMessage');
  });

  it('coalesces a burst into one write and still broadcasts each entry after it', async () => {
    await Promise.all([
      pushAuditEntry({ ...errorSample, userPrompt: 'first' }),
      pushAuditEntry({ ...errorSample, userPrompt: 'second' }),
    ]);
    const sets = callLog.filter((c) => c === 'storage.set');
    const broadcasts = callLog.filter((c) => c === 'runtime.sendMessage');
    expect(sets).toHaveLength(1);
    expect(broadcasts).toHaveLength(2);
    expect(callLog.indexOf('storage.set')).toBeLessThan(callLog.indexOf('runtime.sendMessage'));
    const stored = localStore.get('egaAuditLog') as { entries: AuditEntry[] };
    expect(stored.entries.map((e) => e.userPrompt)).toEqual(['second', 'first']);
  });

  it('a push landing after the drain still reaches storage', async () => {
    const first = pushAuditEntry({ ...errorSample, userPrompt: 'first' });
    await Promise.resolve();
    const second = pushAuditEntry({ ...errorSample, userPrompt: 'late' });
    await Promise.all([first, second]);
    const stored = localStore.get('egaAuditLog') as { entries: AuditEntry[] };
    expect(stored.entries.map((e) => e.userPrompt).sort()).toEqual(['first', 'late']);
  });
});
