// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import RequestAuditLogEntry from '@/options/components/RequestAuditLogEntry.svelte';
import type { AuditEntry } from '@/shared/audit-log';
import type { BackendId } from '@/shared/brands';

function makeEntry(o: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: o.id ?? 'e1',
    ts: o.ts ?? 1700000000000,
    task: o.task ?? 'translate',
    sourceLang: o.sourceLang ?? 'auto',
    targetLang: o.targetLang ?? 'en',
    backend: o.backend ?? ('anthropic' as BackendId),
    model: o.model ?? 'claude-test',
    systemPrompt: o.systemPrompt ?? 'sys',
    userPrompt: o.userPrompt ?? 'user',
    response: o.response ?? 'response',
    latencyMs: o.latencyMs ?? 250,
    cacheHit: o.cacheHit ?? false,
    ...(o.error ? { error: o.error } : {}),
  };
}

const fmtTs = (n: number) => new Date(n).toISOString();
const fmtLat = (ms: number) => `${ms}ms`;

describe('RequestAuditLogEntry', () => {
  it('renders the closed summary row', () => {
    const { container } = render(RequestAuditLogEntry, {
      props: {
        entry: makeEntry({ id: 'a', task: 'translate' }),
        isOpen: false,
        compareSelected: false,
        formatTs: fmtTs,
        formatLatency: fmtLat,
        onToggle: vi.fn(),
        onCompareClick: vi.fn(),
      },
    });
    const item = container.querySelector('[data-ega-audit-entry="a"]');
    expect(item).not.toBeNull();
    expect(item?.textContent).toMatch(/Translate/);
    expect(item?.textContent).toMatch(/250ms/);
    expect(item?.textContent).toMatch(/anthropic/);
  });

  it('cacheHit + error surface their respective pills', () => {
    const { container } = render(RequestAuditLogEntry, {
      props: {
        entry: makeEntry({
          id: 'a',
          cacheHit: true,
          error: { code: 'AUTH', message: 'no key' },
        }),
        isOpen: false,
        compareSelected: false,
        formatTs: fmtTs,
        formatLatency: fmtLat,
        onToggle: vi.fn(),
        onCompareClick: vi.fn(),
      },
    });
    expect(container.querySelector('.pill-cache')).not.toBeNull();
    expect(container.querySelector('.pill-error')).not.toBeNull();
  });

  it('toggle button fires onToggle; compare button fires onCompareClick', async () => {
    const onToggle = vi.fn();
    const onCompareClick = vi.fn();
    const { container } = render(RequestAuditLogEntry, {
      props: {
        entry: makeEntry({ id: 'a' }),
        isOpen: false,
        compareSelected: false,
        formatTs: fmtTs,
        formatLatency: fmtLat,
        onToggle,
        onCompareClick,
      },
    });
    const toggle = container.querySelector('[data-ega-audit-entry-toggle]') as HTMLButtonElement;
    await fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
    const cmp = container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement;
    await fireEvent.click(cmp);
    expect(onCompareClick).toHaveBeenCalledTimes(1);
  });

  it('compareSelected toggles aria-pressed on the compare button', () => {
    const { container } = render(RequestAuditLogEntry, {
      props: {
        entry: makeEntry({ id: 'a' }),
        isOpen: false,
        compareSelected: true,
        formatTs: fmtTs,
        formatLatency: fmtLat,
        onToggle: vi.fn(),
        onCompareClick: vi.fn(),
      },
    });
    const cmp = container.querySelector('[data-ega-audit-compare="a"]');
    expect(cmp?.getAttribute('aria-pressed')).toBe('true');
  });

  it('isOpen=true renders the body', () => {
    const { container } = render(RequestAuditLogEntry, {
      props: {
        entry: makeEntry({ id: 'a' }),
        isOpen: true,
        compareSelected: false,
        formatTs: fmtTs,
        formatLatency: fmtLat,
        onToggle: vi.fn(),
        onCompareClick: vi.fn(),
      },
    });
    const toggle = container.querySelector('[data-ega-audit-entry-toggle]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  });

  it('quickfilter cells fire task / backend callbacks with entry values', async () => {
    const onQuickFilterTask = vi.fn();
    const onQuickFilterBackend = vi.fn();
    const { container } = render(RequestAuditLogEntry, {
      props: {
        entry: makeEntry({ id: 'a', task: 'reword', backend: 'gemini' as BackendId }),
        isOpen: false,
        compareSelected: false,
        formatTs: fmtTs,
        formatLatency: fmtLat,
        onToggle: vi.fn(),
        onCompareClick: vi.fn(),
        onQuickFilterTask,
        onQuickFilterBackend,
      },
    });
    const taskCell = container.querySelector(
      '[data-ega-audit-quickfilter="task"]',
    ) as HTMLButtonElement;
    const backendCell = container.querySelector(
      '[data-ega-audit-quickfilter="backend"]',
    ) as HTMLButtonElement;
    await fireEvent.click(taskCell);
    expect(onQuickFilterTask).toHaveBeenCalledWith('reword');
    await fireEvent.click(backendCell);
    expect(onQuickFilterBackend).toHaveBeenCalledWith('gemini');
  });

  it('quickfilter cells disabled when callbacks absent', () => {
    const { container } = render(RequestAuditLogEntry, {
      props: {
        entry: makeEntry({ id: 'a' }),
        isOpen: false,
        compareSelected: false,
        formatTs: fmtTs,
        formatLatency: fmtLat,
        onToggle: vi.fn(),
        onCompareClick: vi.fn(),
      },
    });
    const taskCell = container.querySelector(
      '[data-ega-audit-quickfilter="task"]',
    ) as HTMLButtonElement;
    expect(taskCell.disabled).toBe(true);
  });
});
