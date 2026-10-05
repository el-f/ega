// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import AttemptFailureBreakdown from '@/options/components/AttemptFailureBreakdown.svelte';
import { resetChromeMock } from '../../mocks/chrome';
import type { AuditEntry } from '@/shared/audit-log';
import type { BackendId } from '@/shared/brands';

function seed(entries: readonly AuditEntry[]): void {
  void chrome.storage.local.set({ egaAuditLog: { version: 1, entries } });
}

function makeEntry(o: Partial<AuditEntry>): AuditEntry {
  return {
    id: o.id ?? Math.random().toString(36).slice(2),
    ts: o.ts ?? Date.now(),
    task: o.task ?? 'translate',
    sourceLang: o.sourceLang ?? 'auto',
    targetLang: o.targetLang ?? 'en',
    backend: o.backend ?? ('anthropic' as BackendId),
    model: o.model ?? 'claude-test',
    systemPrompt: o.systemPrompt ?? 'sys',
    userPrompt: o.userPrompt ?? 'user',
    response: o.response ?? 'response',
    latencyMs: o.latencyMs ?? 100,
    cacheHit: o.cacheHit ?? false,
    ...(o.error ? { error: o.error } : {}),
  };
}

describe('AttemptFailureBreakdown', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('shows empty-state when no errors are in the last hour', async () => {
    const { container } = render(AttemptFailureBreakdown);
    await waitFor(() => {
      expect(container.textContent).toMatch(/No errors in the last hour/);
    });
  });

  it('does not blame the user for an ABORTED row: closing a tab cancels too', async () => {
    seed([makeEntry({ id: 'x', error: { code: 'ABORTED', message: 'cancelled' } })]);
    const { container } = render(AttemptFailureBreakdown);
    await waitFor(() => expect(container.querySelector('.breakdown')).not.toBeNull());
    const msg = container.querySelector('tbody td.msg')?.textContent ?? '';
    expect(msg).toContain('a cancel or a closed tab');
    expect(msg).not.toMatch(/by you/);
  });

  it('aggregates errors by code with counts + latest message', async () => {
    const now = Date.now();
    seed([
      makeEntry({ id: 'a', ts: now - 60_000, error: { code: 'RATE_LIMIT', message: 'too fast' } }),
      makeEntry({
        id: 'b',
        ts: now - 30_000,
        error: { code: 'RATE_LIMIT', message: 'still too fast' },
      }),
      makeEntry({ id: 'c', ts: now - 10_000, error: { code: 'AUTH', message: 'bad key' } }),
    ]);
    const { container } = render(AttemptFailureBreakdown);
    await waitFor(() => {
      expect(container.querySelector('.breakdown')).not.toBeNull();
    });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    // Highest count first.
    const first = rows[0]?.textContent ?? '';
    expect(first).toMatch(/RATE_LIMIT/);
    expect(first).toMatch(/2/);
    // Latest message — entry 'b' is newer than 'a'.
    expect(first).toMatch(/still too fast/);
    const second = rows[1]?.textContent ?? '';
    expect(second).toMatch(/AUTH/);
    expect(second).toMatch(/1/);
  });

  it('ignores errors older than one hour', async () => {
    const now = Date.now();
    seed([
      makeEntry({ id: 'old', ts: now - 90 * 60_000, error: { code: 'OLD', message: 'stale' } }),
      makeEntry({ id: 'fresh', ts: now - 5_000, error: { code: 'FRESH', message: 'recent' } }),
    ]);
    const { container } = render(AttemptFailureBreakdown);
    await waitFor(() => {
      expect(container.querySelector('.breakdown')).not.toBeNull();
    });
    expect(container.textContent).not.toMatch(/OLD/);
    expect(container.textContent).toMatch(/FRESH/);
  });
});
