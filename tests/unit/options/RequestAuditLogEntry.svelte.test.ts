// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import RequestAuditLogEntry from '@/options/components/RequestAuditLogEntry.svelte';
import type { AuditEntry } from '@/shared/audit-log';
import type { BackendId } from '@/shared/brands';

const NOW = 1_700_000_600_000;

function makeEntry(o: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: o.id ?? 'e1',
    ts: o.ts ?? NOW - 5 * 60_000,
    task: o.task ?? 'translate',
    sourceLang: o.sourceLang ?? 'auto',
    targetLang: o.targetLang ?? 'en',
    backend: o.backend ?? ('anthropic' as BackendId),
    model: o.model ?? 'claude-test',
    systemPrompt: o.systemPrompt ?? 'sys',
    userPrompt: o.userPrompt ?? 'user',
    response: o.response ?? 'response',
    latencyMs: o.latencyMs ?? 410,
    cacheHit: o.cacheHit ?? false,
    ...(o.error ? { error: o.error } : {}),
    ...(o.inputTokens !== undefined ? { inputTokens: o.inputTokens } : {}),
    ...(o.outputTokens !== undefined ? { outputTokens: o.outputTokens } : {}),
  };
}

function renderRow(entry: AuditEntry, extra: Record<string, unknown> = {}) {
  const props = {
    entry,
    isOpen: false,
    compareSelected: false,
    now: NOW,
    formatTs: () => 'FULL DATE',
    formatLatency: (ms: number) => `${ms} ms`,
    onToggle: vi.fn(),
    onCompareClick: vi.fn(),
    ...extra,
  };
  return { ...render(RequestAuditLogEntry, { props }), props };
}

const status = (c: HTMLElement): string =>
  c.querySelector('[data-ega-audit-status]')?.textContent.trim() ?? '';

describe('RequestAuditLogEntry', () => {
  it('reads as words: task, backend name, time taken, status and when', () => {
    const { container } = renderRow(makeEntry());
    const row = container.querySelector('.entry-row');
    expect(row?.textContent.replace(/\s+/g, ' ')).toContain('Translate Anthropic 410 ms OK 5m ago');
    // No raw id, no shouted enum.
    expect(row?.textContent).not.toMatch(/anthropic|TRANSLATE/);
  });

  it('the relative time carries the full date for a screen reader', () => {
    const { container } = renderRow(makeEntry());
    expect(container.querySelector('.ega-sr-only')?.textContent).toBe('FULL DATE');
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('5m ago');
  });

  it('a cache hit reads "From cache"; a row no backend answered names Ega', () => {
    const { container } = renderRow(
      makeEntry({ cacheHit: true, backend: 'unknown' as AuditEntry['backend'] }),
    );
    expect(status(container)).toBe('From cache');
    expect(container.textContent).toContain('Ega');
  });

  it('an error shows the shared plain title, never the code', () => {
    const { container } = renderRow(makeEntry({ error: { code: 'AUTH', message: '401 bad key' } }));
    expect(status(container)).toBe('API key rejected');
    expect(container.querySelector('.entry-status.failed')).not.toBeNull();
    expect(container.querySelector('.entry-row')?.textContent).not.toContain('AUTH');
  });

  it('a request the user canceled reads "Canceled", not in the error color', () => {
    const { container } = renderRow(makeEntry({ error: { code: 'ABORTED', message: 'aborted' } }));
    expect(status(container)).toBe('Canceled');
    expect(container.querySelector('.entry-status.failed')).toBeNull();
  });

  it('Details is a named text button that toggles the row', async () => {
    const { getByRole, props } = renderRow(makeEntry());
    const details = getByRole('button', { name: 'Details: Translate, FULL DATE' });
    expect(details.textContent.trim()).toBe('Details');
    expect(details.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(details);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it('open: the body shows the tokens and the code, with Compare at the end', async () => {
    const { container, getByRole, props } = renderRow(
      makeEntry({
        id: 'a',
        inputTokens: 1200,
        outputTokens: 30,
        error: { code: 'AUTH', message: 'no key' },
      }),
      { isOpen: true, compareSelected: true },
    );
    expect(getByRole('button', { name: /^Details/ }).getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.entry-tokens')?.textContent).toBe('1,200 in · 30 out');
    expect(container.textContent).toContain('Technical');
    expect(container.textContent).toContain('AUTH');
    const compare = getByRole('button', { name: 'Compare' });
    expect(compare.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(compare);
    expect(props.onCompareClick).toHaveBeenCalledTimes(1);
  });

  it('closed: no body and no Compare', () => {
    const { container, queryByRole } = renderRow(makeEntry());
    expect(container.querySelector('[data-ega-audit-user]')).toBeNull();
    expect(queryByRole('button', { name: 'Compare' })).toBeNull();
  });
});
