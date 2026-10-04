import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pushAuditEntry,
  readAuditLog,
  clearAuditLog,
  AUDIT_LOG_CAP,
  AUDIT_BATCH_CAP,
  AUDIT_MAX_PROMPT_CHARS,
  AUDIT_MAX_RESPONSE_CHARS,
  AUDIT_MAX_PROMPT_CHARS_WITH_ERROR,
  AUDIT_MAX_RESPONSE_CHARS_WITH_ERROR,
  AUDIT_MAX_ERROR_MESSAGE_CHARS,
  clampField,
  type AuditEntry,
} from '@/shared/audit-log';
import { asBackendIdUnsafe } from '@/shared/brands';

const localStore = new Map<string, unknown>();
beforeEach(() => {
  localStore.clear();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (key: string | string[]) => {
          const k = Array.isArray(key) ? (key[0] ?? '') : key;
          return Promise.resolve({ [k]: localStore.get(k) });
        },
        set: (entries: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(entries)) localStore.set(k, v);
          return Promise.resolve();
        },
        remove: (key: string) => {
          localStore.delete(key);
          return Promise.resolve();
        },
      },
    },
  });
});

const sample: Omit<AuditEntry, 'id' | 'ts'> = {
  task: 'translate',
  sourceLang: 'arabizi',
  targetLang: 'en',
  backend: asBackendIdUnsafe('anthropic'),
  model: 'claude-haiku-4-5',
  systemPrompt: 'sys',
  userPrompt: 'usr',
  response: 'hello',
  latencyMs: 0,
  cacheHit: false,
};

describe('audit-log', () => {
  it('starts empty', async () => {
    expect(await readAuditLog()).toEqual([]);
  });

  it('pushAuditEntry appends + auto-stamps id and ts', async () => {
    await pushAuditEntry(sample);
    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(log[0]?.ts).toBeGreaterThan(0);
    expect(log[0]?.task).toBe('translate');
  });

  it('FIFO caps at AUDIT_LOG_CAP', async () => {
    for (let i = 0; i < AUDIT_LOG_CAP + 5; i++) {
      await pushAuditEntry({ ...sample, response: `r${i}` });
    }
    const log = await readAuditLog();
    expect(log).toHaveLength(AUDIT_LOG_CAP);
    // Newest first — `r${AUDIT_LOG_CAP + 4}` should lead.
    expect(log[0]?.response).toBe(`r${AUDIT_LOG_CAP + 4}`);
  });

  it('clearAuditLog empties storage', async () => {
    await pushAuditEntry(sample);
    await clearAuditLog();
    expect(await readAuditLog()).toEqual([]);
  });

  it('drops the row of a request that began before the log was cleared', async () => {
    await clearAuditLog();
    await pushAuditEntry({ ...sample, latencyMs: 60_000, response: 'in flight at the clear' });
    expect(await readAuditLog()).toEqual([]);
  });

  it('keeps the row of a request that began after the clear', async () => {
    // A fake clock, so the request starts a set 5 ms after the clear.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(10_000);
      await clearAuditLog();
      vi.setSystemTime(10_005);
      await pushAuditEntry({ ...sample, latencyMs: 0, response: 'after the clear' });
    } finally {
      vi.useRealTimers();
    }
    expect((await readAuditLog())[0]?.response).toBe('after the clear');
  });

  it('AUDIT_LOG_CAP is 50', () => {
    expect(AUDIT_LOG_CAP).toBe(50);
  });

  describe('schema v1 envelope', () => {
    it('writes a versioned envelope, not a bare array', async () => {
      await pushAuditEntry(sample);
      const stored = localStore.get('egaAuditLog');
      expect(stored).toMatchObject({ version: 1, entries: expect.any(Array) });
    });

    it('a bare-array value (no envelope) reads as empty', async () => {
      const bare: AuditEntry[] = [{ id: 'bare-1', ts: 100, ...sample }];
      localStore.set('egaAuditLog', bare);
      expect(await readAuditLog()).toEqual([]);
    });

    it('ignores corrupt storage shape and starts empty', async () => {
      localStore.set('egaAuditLog', { version: 999, junk: true });
      expect(await readAuditLog()).toEqual([]);
    });
  });

  describe('payload truncation — PII bounding', () => {
    it('default success-path prompt cap is 200 chars', () => {
      expect(AUDIT_MAX_PROMPT_CHARS).toBe(200);
    });

    it('default success-path response cap is 200 chars', () => {
      expect(AUDIT_MAX_RESPONSE_CHARS).toBe(200);
    });

    it('error-path prompt cap is 1000 chars', () => {
      expect(AUDIT_MAX_PROMPT_CHARS_WITH_ERROR).toBe(1000);
    });

    it('error-path response cap is 1000 chars', () => {
      expect(AUDIT_MAX_RESPONSE_CHARS_WITH_ERROR).toBe(1000);
    });

    it('error message cap is 500 chars', () => {
      expect(AUDIT_MAX_ERROR_MESSAGE_CHARS).toBe(500);
    });

    it('clamps systemPrompt to AUDIT_MAX_PROMPT_CHARS + marker on success path', async () => {
      const oversized = 'a'.repeat(AUDIT_MAX_PROMPT_CHARS + 500);
      await pushAuditEntry({ ...sample, systemPrompt: oversized });
      const log = await readAuditLog();
      const stored = log[0]?.systemPrompt ?? '';
      expect(stored.length).toBeLessThan(oversized.length);
      expect(stored).toMatch(/\.\.\.\[truncated 500 chars\]$/);
    });

    it('clamps userPrompt to AUDIT_MAX_PROMPT_CHARS + marker on success path', async () => {
      const oversized = 'b'.repeat(AUDIT_MAX_PROMPT_CHARS + 1);
      await pushAuditEntry({ ...sample, userPrompt: oversized });
      const log = await readAuditLog();
      expect(log[0]?.userPrompt).toMatch(/\.\.\.\[truncated 1 chars\]$/);
    });

    it('clamps response to AUDIT_MAX_RESPONSE_CHARS + marker on success path', async () => {
      const oversized = 'c'.repeat(AUDIT_MAX_RESPONSE_CHARS + 50);
      await pushAuditEntry({ ...sample, response: oversized });
      const log = await readAuditLog();
      expect(log[0]?.response).toMatch(/\.\.\.\[truncated 50 chars\]$/);
    });

    it('passes through fields at or under the success-path limit unchanged', async () => {
      const exact = 'x'.repeat(AUDIT_MAX_RESPONSE_CHARS);
      await pushAuditEntry({ ...sample, response: exact });
      const log = await readAuditLog();
      expect(log[0]?.response).toBe(exact);
    });

    it('uses wider error-path cap when entry has an error field', async () => {
      const oversized = 'd'.repeat(AUDIT_MAX_PROMPT_CHARS_WITH_ERROR + 10);
      await pushAuditEntry({
        ...sample,
        userPrompt: oversized,
        error: { code: 'X', message: 'boom' },
      });
      const log = await readAuditLog();
      // Error path: prompt kept up to 1000 chars, not 200.
      expect(log[0]?.userPrompt).toMatch(/\.\.\.\[truncated 10 chars\]$/);
      // Specifically: length should exceed the default success cap.
      expect((log[0]?.userPrompt ?? '').length).toBeGreaterThan(AUDIT_MAX_PROMPT_CHARS);
    });

    it('does NOT use error cap when entry has no error field', async () => {
      const between = 'e'.repeat(AUDIT_MAX_PROMPT_CHARS + 50);
      await pushAuditEntry({ ...sample, userPrompt: between });
      const log = await readAuditLog();
      expect(log[0]?.userPrompt).toMatch(/\.\.\.\[truncated 50 chars\]$/);
    });

    it('clamps error.message to AUDIT_MAX_ERROR_MESSAGE_CHARS', async () => {
      const longMsg = 'f'.repeat(AUDIT_MAX_ERROR_MESSAGE_CHARS + 20);
      await pushAuditEntry({
        ...sample,
        error: { code: 'BIG', message: longMsg },
      });
      const log = await readAuditLog();
      expect(log[0]?.error?.message).toMatch(/\.\.\.\[truncated 20 chars\]$/);
    });

    it('clampField returns input unchanged below limit', () => {
      expect(clampField('hi', 10)).toBe('hi');
    });
  });

  describe('concurrent writes are serialized', () => {
    it('preserves all entries when many pushes race', async () => {
      const total = 12;
      await Promise.all(
        Array.from({ length: total }, (_, i) => pushAuditEntry({ ...sample, response: `c${i}` })),
      );
      const log = await readAuditLog();
      expect(log).toHaveLength(total);
      const responses = new Set(log.map((e) => e.response));
      // Every dispatched response must land — the bug being fixed drops some.
      for (let i = 0; i < total; i++) {
        expect(responses.has(`c${i}`)).toBe(true);
      }
    });

    it('clearAuditLog drains the pending write tail', async () => {
      const pending = pushAuditEntry({ ...sample, response: 'racing-with-clear' });
      await clearAuditLog();
      await pending.catch(() => undefined);
      // The log stays empty even if the push finished mid-clear.
      expect(await readAuditLog()).toEqual([]);
    });

    it('a push queued BEFORE clear cannot slip an entry past the clear', async () => {
      // clear runs on the same lock as push, so the queued push writes first and the remove wipes it.
      const racing = pushAuditEntry({ ...sample, response: 'pre-clear' });
      const clear = clearAuditLog();
      await Promise.all([racing.catch(() => undefined), clear]);
      expect(await readAuditLog()).toEqual([]);
    });
  });

  describe('requestId correlation', () => {
    it('round-trips an optional requestId', async () => {
      await pushAuditEntry({ ...sample, requestId: 'req-abc' });
      const log = await readAuditLog();
      expect(log[0]?.requestId).toBe('req-abc');
    });
  });

  // Mutation-invariant discipline: cap edges — the FIFO cap must maintain
  // newest-first ordering at and around the boundary, not just over-cap.
  describe('cap edges — FIFO boundary', () => {
    it('at exactly AUDIT_LOG_CAP entries, the log is full and all entries are present', async () => {
      for (let i = 0; i < AUDIT_LOG_CAP; i++) {
        await pushAuditEntry({ ...sample, response: `r${i}` });
      }
      const log = await readAuditLog();
      expect(log).toHaveLength(AUDIT_LOG_CAP);
      expect(log[0]?.response).toBe(`r${AUDIT_LOG_CAP - 1}`);
      expect(log[AUDIT_LOG_CAP - 1]?.response).toBe('r0');
    });

    it('at AUDIT_LOG_CAP - 1 entries, adding one more does not drop any entry', async () => {
      for (let i = 0; i < AUDIT_LOG_CAP - 1; i++) {
        await pushAuditEntry({ ...sample, response: `r${i}` });
      }
      await pushAuditEntry({ ...sample, response: 'newest' });

      const log = await readAuditLog();
      expect(log).toHaveLength(AUDIT_LOG_CAP);
      expect(log[0]?.response).toBe('newest');
      expect(log[AUDIT_LOG_CAP - 1]?.response).toBe('r0');
    });

    it('at AUDIT_LOG_CAP + 1, the oldest entry is evicted', async () => {
      for (let i = 0; i < AUDIT_LOG_CAP + 1; i++) {
        await pushAuditEntry({ ...sample, response: `r${i}` });
      }
      const log = await readAuditLog();
      expect(log).toHaveLength(AUDIT_LOG_CAP);
      // Newest first.
      expect(log[0]?.response).toBe(`r${AUDIT_LOG_CAP}`);
      // The very first entry (r0) must be gone.
      expect(log.some((e) => e.response === 'r0')).toBe(false);
    });
  });

  // A corrupt stored shape must not crash pushAuditEntry; it starts a fresh log.
  describe('post-error state — corrupt storage recovery', () => {
    it('push after a corrupt stored shape starts a fresh log', async () => {
      localStore.set('egaAuditLog', { completelyWrong: true });

      await pushAuditEntry({ ...sample, response: 'after-corrupt' });

      const log = await readAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0]?.response).toBe('after-corrupt');
    });

    it('clearAuditLog on empty storage is a no-op without error', async () => {
      await expect(clearAuditLog()).resolves.toBeUndefined();
      expect(await readAuditLog()).toEqual([]);
    });
  });
});

describe('page-translate rows cannot evict the interactive log', () => {
  it('keeps at most AUDIT_BATCH_CAP batch rows and every interactive row', async () => {
    for (let i = 0; i < 5; i++) await pushAuditEntry({ ...sample, userPrompt: `chat ${i}` });
    for (let i = 0; i < 40; i++) {
      await pushAuditEntry({ ...sample, userPrompt: `block ${i}`, batch: true });
    }
    const log = await readAuditLog();
    expect(log.filter((e) => e.batch === true)).toHaveLength(AUDIT_BATCH_CAP);
    expect(log.filter((e) => e.userPrompt.startsWith('chat '))).toHaveLength(5);
    // Newest batch rows win, so the survivors are the last ten blocks.
    expect(log.find((e) => e.batch === true)?.userPrompt).toBe('block 39');
  });
});
