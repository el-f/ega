// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import RequestAuditLog from '@/options/components/RequestAuditLog.svelte';
import { resetChromeMock } from '../../mocks/chrome';
import type { AuditEntry } from '@/shared/audit-log';
import type { BackendId } from '@/shared/brands';

function seed(entries: readonly AuditEntry[]): void {
  // Seed the v1 envelope, the shape new writes use.
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
    systemPrompt: o.systemPrompt ?? 'system',
    userPrompt: o.userPrompt ?? 'user',
    response: o.response ?? 'response',
    latencyMs: o.latencyMs ?? 100,
    cacheHit: o.cacheHit ?? false,
    ...(o.error ? { error: o.error } : {}),
  };
}

describe('RequestAuditLog — filters', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('filter row only renders once there are entries', async () => {
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-request-audit-log]')).toBeTruthy();
    });
    // Empty state — no filters.
    expect(container.querySelector('[data-ega-audit-filters]')).toBeNull();
  });

  it('renders filter row + applies task filter against the seeded entries', async () => {
    seed([
      makeEntry({ id: 'a', task: 'translate', userPrompt: 'apple' }),
      makeEntry({ id: 'b', task: 'explain', userPrompt: 'banana' }),
      makeEntry({ id: 'c', task: 'translate', userPrompt: 'cherry' }),
    ]);
    const { container } = render(RequestAuditLog);

    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-ega-audit-filters]')).toBeTruthy();

    const taskSelect = container.querySelector('[data-ega-audit-filter-task]') as HTMLSelectElement;
    await fireEvent.change(taskSelect, { target: { value: 'explain' } });

    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeNull();
      expect(container.querySelector('[data-ega-audit-entry="b"]')).toBeTruthy();
      expect(container.querySelector('[data-ega-audit-entry="c"]')).toBeNull();
    });

    expect(container.querySelector('[data-ega-audit-match-count]')?.textContent).toMatch(
      /1\s+match\b/,
    );
  });

  it('filter applied to query matches against userPrompt/response/error', async () => {
    seed([
      makeEntry({ id: 'a', userPrompt: 'hello world', response: 'r1' }),
      makeEntry({ id: 'b', userPrompt: 'foo bar', response: 'r2' }),
      makeEntry({
        id: 'c',
        userPrompt: 'baz',
        response: 'r3',
        error: { code: 'KEY_INVALID', message: 'hello again' },
      }),
    ]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    const q = container.querySelector('[data-ega-audit-filter-query]') as HTMLInputElement;
    await fireEvent.input(q, { target: { value: 'hello' } });
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
      expect(container.querySelector('[data-ega-audit-entry="b"]')).toBeNull();
      expect(container.querySelector('[data-ega-audit-entry="c"]')).toBeTruthy();
    });
  });

  it('empty filter result surfaces "Clear filters" CTA', async () => {
    seed([makeEntry({ id: 'a', task: 'translate' })]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    const taskSelect = container.querySelector('[data-ega-audit-filter-task]') as HTMLSelectElement;
    await fireEvent.change(taskSelect, { target: { value: 'grammar' } });

    const cta = await waitFor(() => {
      const btn = container.querySelector('[data-ega-empty-state] .cta');
      if (!btn) throw new Error('CTA not mounted yet');
      return btn as HTMLButtonElement;
    });
    expect(cta.textContent).toMatch(/clear filters/i);

    await fireEvent.click(cta);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
  });

  it('compare flow — first click picks an entry, second opens the diff modal oldest-first', async () => {
    seed([
      makeEntry({ id: 'old', ts: 1000, systemPrompt: 'sys-old', response: 'resp-old' }),
      makeEntry({ id: 'new', ts: 2000, systemPrompt: 'sys-new', response: 'resp-new' }),
    ]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="old"]')).toBeTruthy();
    });

    // First click — sets compareTargetId, marks the row as selected, no modal.
    const cmpNew = container.querySelector('[data-ega-audit-compare="new"]') as HTMLButtonElement;
    await fireEvent.click(cmpNew);
    expect(cmpNew.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-ega-audit-diff-modal]')).toBeNull();

    // Second click — opens the diff modal. Older entry left, newer right.
    const cmpOld = container.querySelector('[data-ega-audit-compare="old"]') as HTMLButtonElement;
    await fireEvent.click(cmpOld);

    const modal = await waitFor(() => {
      const m = container.querySelector('[data-ega-audit-diff-modal]');
      if (!m) throw new Error('diff modal not mounted');
      return m as HTMLElement;
    });
    // Either container or the dialog primitive mounts the modal — querySelectorAll
    // through document scope keeps the lookup resilient.
    const leftSys = document.querySelector('[data-ega-diff-system-left]');
    const rightSys = document.querySelector('[data-ega-diff-system-right]');
    expect(leftSys?.textContent).toBe('sys-old');
    expect(rightSys?.textContent).toBe('sys-new');
    expect(modal.closest('.ega-dialog')?.textContent).toContain('Compare audit entries');

    // Compare-pressed state clears once the modal mounts.
    expect(
      (
        container.querySelector('[data-ega-audit-compare="new"]') as HTMLButtonElement | null
      )?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('compare prompt pill surfaces after first pick + Cancel clears the selection', async () => {
    seed([makeEntry({ id: 'a', ts: 1000 }), makeEntry({ id: 'b', ts: 2000 })]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    // No prompt before pair-pick starts.
    expect(container.querySelector('[data-ega-audit-compare-prompt]')).toBeNull();

    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement,
    );
    // Pair-pick pill mounts with the "pick a second entry" prompt.
    const prompt = await waitFor(() => {
      const p = container.querySelector('[data-ega-audit-compare-prompt]');
      if (!p) throw new Error('compare prompt not mounted');
      return p as HTMLElement;
    });
    expect(prompt.textContent).toMatch(/Pick a second entry/i);

    // Cancel resets the selection + drops the pill.
    const cancel = container.querySelector('[data-ega-audit-compare-cancel]') as HTMLButtonElement;
    await fireEvent.click(cancel);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-compare-prompt]')).toBeNull();
    });
    expect(
      (
        container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement | null
      )?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('filter-active-count pill appears when filters active and clears them on click', async () => {
    seed([makeEntry({ id: 'a', task: 'translate' }), makeEntry({ id: 'b', task: 'reword' })]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    // No pill while EMPTY_FILTERS.
    expect(container.querySelector('[data-ega-audit-filter-count]')).toBeNull();

    const taskCell = container.querySelectorAll(
      '[data-ega-audit-quickfilter="task"]',
    )[0] as HTMLButtonElement;
    await fireEvent.click(taskCell);

    const pill = await waitFor(() => {
      const p = container.querySelector('[data-ega-audit-filter-count]');
      if (!p) throw new Error('filter-count pill missing');
      return p as HTMLButtonElement;
    });
    expect(pill.textContent).toMatch(/1 filter/);

    await fireEvent.click(pill);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-filter-count]')).toBeNull();
    });
  });

  it('compare flow — pair-pick prompt button scrolls pinned entry into view', async () => {
    seed([makeEntry({ id: 'a' })]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement,
    );
    const scrollBtn = await waitFor(() => {
      const el = container.querySelector('[data-ega-audit-compare-scroll]');
      if (!el) throw new Error('scroll-to-pinned button missing');
      return el as HTMLButtonElement;
    });
    const entry = container.querySelector('[data-ega-audit-entry="a"]') as HTMLElement;
    const spy = vi.spyOn(entry, 'scrollIntoView').mockImplementation(() => {});
    await fireEvent.click(scrollBtn);
    expect(spy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    spy.mockRestore();
  });

  it('compare flow — clicking the same entry twice cancels the selection', async () => {
    seed([makeEntry({ id: 'a' })]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    const btn = container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement;
    await fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-ega-audit-diff-modal]')).toBeNull();
  });

  it('compare flow — Close button drops the modal', async () => {
    seed([makeEntry({ id: 'a', ts: 1000 }), makeEntry({ id: 'b', ts: 2000 })]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement,
    );
    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare="b"]') as HTMLButtonElement,
    );
    const modal = await waitFor(() => {
      const m = document.querySelector('[data-ega-audit-diff-modal]');
      if (!m) throw new Error('diff modal not mounted');
      return m as HTMLElement;
    });
    const closeBtn = modal.closest('.ega-dialog')?.querySelector('.ega-dialog-close') as
      HTMLButtonElement | undefined;
    if (!closeBtn) throw new Error('dialog close button not mounted');
    await fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(document.querySelector('[data-ega-audit-diff-modal]')).toBeNull();
    });
  });

  it('diff modal closes + surfaces notice when a pinned entry is yanked', async () => {
    seed([makeEntry({ id: 'a', ts: 1000 }), makeEntry({ id: 'b', ts: 2000 })]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare="a"]') as HTMLButtonElement,
    );
    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare="b"]') as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-ega-audit-diff-modal]')).not.toBeNull();
    });
    // The SW push that trims 'a' off the tail — the write itself must wake the listener.
    seed([makeEntry({ id: 'b', ts: 2000 }), makeEntry({ id: 'c', ts: 3000 })]);
    await waitFor(() => {
      expect(document.querySelector('[data-ega-audit-diff-modal]')).toBeNull();
      expect(container.querySelector('[data-ega-audit-diff-yanked-notice]')).not.toBeNull();
    });
  });

  it('persists active filters to chrome.storage.session', async () => {
    seed([makeEntry({ id: 'a', task: 'translate' })]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
    const taskSelect = container.querySelector('[data-ega-audit-filter-task]') as HTMLSelectElement;
    await fireEvent.change(taskSelect, { target: { value: 'explain' } });

    await waitFor(async () => {
      const out = await chrome.storage.session.get('ega.audit-log.filters');
      expect((out['ega.audit-log.filters'] as { task?: string } | undefined)?.task).toBe('explain');
    });
  });

  it('picks up an entry the real pushAuditEntry() writer appended', async () => {
    const { container } = render(RequestAuditLog);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-empty-state]')).not.toBeNull();
    });

    const { pushAuditEntry } = await import('@/shared/audit-log');
    await pushAuditEntry({
      task: 'translate',
      sourceLang: 'auto',
      targetLang: 'en',
      backend: 'anthropic' as BackendId,
      model: 'claude-test',
      systemPrompt: 'system',
      userPrompt: 'user',
      response: 'response',
      latencyMs: 12,
      cacheHit: false,
    });

    await waitFor(() => {
      expect(container.querySelectorAll('[data-ega-audit-entry]')).toHaveLength(1);
    });
  });
});

describe('RequestAuditLog — tokens', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  const norm = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();

  it('shows each row its token pair and the log its total', async () => {
    seed([
      { ...makeEntry({ id: 'a' }), inputTokens: 1200, outputTokens: 30 },
      { ...makeEntry({ id: 'b' }), inputTokens: 50, outputTokens: 10 },
      makeEntry({ id: 'c', cacheHit: true }),
    ]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy());
    const pair = (id: string) =>
      norm(container.querySelector(`[data-ega-audit-entry="${id}"] .entry-tokens`)?.textContent);
    expect(pair('a')).toBe('1,200 in · 30 out');
    expect(pair('b')).toBe('50 in · 10 out');
    expect(container.querySelector('[data-ega-audit-entry="c"] .entry-tokens')).toBeNull();
    expect(norm(container.querySelector('.token-total')?.textContent)).toBe(
      'Total tokens in the log: 1,250 in · 40 out',
    );
  });

  it('shows no total when no row reports tokens, and skips a stored value that is not a number', async () => {
    seed([
      makeEntry({ id: 'a' }),
      { ...makeEntry({ id: 'b' }), inputTokens: 'lots' as unknown as number },
    ]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => expect(container.querySelector('[data-ega-audit-entry="b"]')).toBeTruthy());
    expect(container.querySelector('.token-total')).toBeNull();
    expect(container.querySelector('[data-ega-audit-entry="b"] .entry-tokens')).toBeNull();
  });
});

describe('RequestAuditLog — a one-sided token report', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('totals only the side some row reported, with no made-up zero', async () => {
    seed([
      { ...makeEntry({ id: 'a' }), inputTokens: 100 },
      { ...makeEntry({ id: 'b' }), inputTokens: 50 },
    ]);
    const { container } = render(RequestAuditLog);
    await waitFor(() => expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy());
    expect(container.querySelector('.token-total')?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Total tokens in the log: 150 in',
    );
  });
});
