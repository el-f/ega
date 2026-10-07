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

const rows = (c: HTMLElement): HTMLElement[] => [...c.querySelectorAll<HTMLElement>('.error-row')];
const norm = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();

describe('AttemptFailureBreakdown', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('empty: the check icon and one title, no body line', async () => {
    const { container } = render(AttemptFailureBreakdown);
    await waitFor(() => expect(container.textContent).toContain('No errors in the last hour'));
    expect(container.querySelector('[data-ega-empty-state] .desc')).toBeNull();
  });

  it('one row per error and backend, in plain words, with the count and the newest message', async () => {
    const now = Date.now();
    seed([
      makeEntry({ id: 'a', ts: now - 60_000, error: { code: 'AUTH', message: '401 first' } }),
      makeEntry({ id: 'b', ts: now - 30_000, error: { code: 'AUTH', message: '401 second' } }),
      makeEntry({
        id: 'c',
        ts: now - 20_000,
        backend: 'gemini' as BackendId,
        error: { code: 'AUTH', message: 'gemini says no' },
      }),
    ]);
    const { container } = render(AttemptFailureBreakdown);
    await waitFor(() => expect(rows(container)).toHaveLength(2));
    const [first, second] = rows(container);
    expect(norm(first?.querySelector('.error-title')?.textContent)).toBe('API key rejected');
    expect(norm(first?.querySelector('.error-meta')?.textContent)).toMatch(
      /^Anthropic · 2 times · last /,
    );
    expect(first?.querySelector('.line')?.textContent).toBe(
      'Anthropic did not accept the saved API key.',
    );
    // The raw message and the code live under Details only.
    expect(norm(first?.querySelector('.detail')?.textContent)).toBe('401 secondCode: AUTH');
    expect(norm(second?.querySelector('.error-meta')?.textContent)).toMatch(/^Gemini · 1 time · /);
  });

  it('a canceled request reads as stopped, and does not blame the user', async () => {
    seed([makeEntry({ id: 'x', error: { code: 'ABORTED', message: 'cancelled' } })]);
    const { container } = render(AttemptFailureBreakdown);
    await waitFor(() => expect(rows(container)).toHaveLength(1));
    expect(container.textContent).toContain('A cancel or a closed tab stopped the request.');
    expect(container.textContent).not.toMatch(/by you/);
  });

  it('ignores errors older than one hour', async () => {
    const now = Date.now();
    seed([
      makeEntry({ id: 'old', ts: now - 90 * 60_000, error: { code: 'TIMEOUT', message: 'stale' } }),
      makeEntry({ id: 'fresh', ts: now - 5_000, error: { code: 'NETWORK', message: 'recent' } }),
    ]);
    const { container } = render(AttemptFailureBreakdown);
    await waitFor(() => expect(rows(container)).toHaveLength(1));
    expect(container.textContent).toContain('No connection');
    expect(container.textContent).not.toContain('No answer in time');
  });
});
