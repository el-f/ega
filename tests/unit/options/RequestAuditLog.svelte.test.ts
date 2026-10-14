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

async function mounted(id: string) {
  const view = render(RequestAuditLog);
  await waitFor(() => {
    expect(view.container.querySelector(`[data-ega-audit-entry="${id}"]`)).toBeTruthy();
  });
  return view;
}

/** Compare sits inside Details, so a row is opened first. */
async function compare(container: HTMLElement, id: string): Promise<HTMLButtonElement> {
  const row = container.querySelector(`[data-ega-audit-entry="${id}"]`) as HTMLElement;
  const toggle = row.querySelector('[data-ega-audit-entry-toggle]') as HTMLButtonElement;
  if (toggle.getAttribute('aria-expanded') === 'false') await fireEvent.click(toggle);
  const btn = row.querySelector(`[data-ega-audit-compare="${id}"]`) as HTMLButtonElement;
  await fireEvent.click(btn);
  return btn;
}

describe('RequestAuditLog — card', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('empty: one EmptyState, no filters, and no Export or Clear', async () => {
    const { container, queryByRole } = render(RequestAuditLog);
    await waitFor(() => expect(container.querySelector('[data-ega-empty-state]')).toBeTruthy());
    expect(container.textContent).toContain('No requests yet');
    expect(container.textContent).toContain('Requests show here after you translate');
    expect(container.querySelector('[data-ega-audit-filters]')).toBeNull();
    expect(queryByRole('button', { name: 'Export' })).toBeNull();
    expect(queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('with requests: Export and Clear are secondary buttons in the card header', async () => {
    seed([makeEntry({ id: 'a' })]);
    const { getByRole } = await mounted('a');
    expect(getByRole('heading', { level: 2 }).textContent).toBe('Recent requests');
    for (const name of ['Export', 'Clear']) {
      const btn = getByRole('button', { name });
      expect(btn.classList.contains('variant-secondary')).toBe(true);
      expect(btn.closest('.ega-section-card-actions')).not.toBeNull();
    }
  });
});

describe('RequestAuditLog — filters', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('applies the task filter and says how many match', async () => {
    seed([
      makeEntry({ id: 'a', task: 'translate', userPrompt: 'apple' }),
      makeEntry({ id: 'b', task: 'explain', userPrompt: 'banana' }),
      makeEntry({ id: 'c', task: 'translate', userPrompt: 'cherry' }),
    ]);
    const { container } = await mounted('a');
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

  it('Clear filters beside the count brings every request back', async () => {
    seed([makeEntry({ id: 'a', task: 'translate' }), makeEntry({ id: 'b', task: 'reword' })]);
    const { container } = await mounted('a');
    expect(container.querySelector('[data-ega-audit-clear-filters]')).toBeNull();
    await fireEvent.change(container.querySelector('[data-ega-audit-filter-task]') as Element, {
      target: { value: 'reword' },
    });
    const clear = await waitFor(() => {
      const b = container.querySelector('[data-ega-audit-clear-filters]');
      if (!b) throw new Error('Clear filters missing');
      return b as HTMLButtonElement;
    });
    await fireEvent.click(clear);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-ega-audit-entry]')).toHaveLength(2);
      expect(container.querySelector('[data-ega-audit-match-count]')).toBeNull();
    });
  });

  it('the search matches the prompt, the reply and the error', async () => {
    seed([
      makeEntry({ id: 'a', userPrompt: 'hello world', response: 'r1' }),
      makeEntry({ id: 'b', userPrompt: 'foo bar', response: 'r2' }),
      makeEntry({
        id: 'c',
        userPrompt: 'baz',
        response: 'r3',
        error: { code: 'AUTH', message: 'hello again' },
      }),
    ]);
    const { container } = await mounted('a');
    const q = container.querySelector('[data-ega-audit-filter-query]') as HTMLInputElement;
    await fireEvent.input(q, { target: { value: 'hello' } });
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
      expect(container.querySelector('[data-ega-audit-entry="b"]')).toBeNull();
      expect(container.querySelector('[data-ega-audit-entry="c"]')).toBeTruthy();
    });
  });

  it('filtered to nothing: says so, with a Clear filters button', async () => {
    seed([makeEntry({ id: 'a', task: 'translate' })]);
    const { container } = await mounted('a');
    await fireEvent.change(container.querySelector('[data-ega-audit-filter-task]') as Element, {
      target: { value: 'grammar' },
    });
    const empty = await waitFor(() => {
      const el = container.querySelector('[data-ega-audit-no-match]');
      if (!el) throw new Error('no-match line missing');
      return el as HTMLElement;
    });
    expect(empty.textContent).toContain('No request matches these filters');
    await fireEvent.click(empty.querySelector('button') as HTMLButtonElement);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-entry="a"]')).toBeTruthy();
    });
  });

  it('persists active filters to chrome.storage.session', async () => {
    seed([makeEntry({ id: 'a', task: 'translate' })]);
    const { container } = await mounted('a');
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

describe('RequestAuditLog — compare', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('first Compare picks a request, the second opens the comparison oldest-first', async () => {
    seed([
      makeEntry({ id: 'old', ts: 1000, systemPrompt: 'sys-old', response: 'resp-old' }),
      makeEntry({ id: 'new', ts: 2000, systemPrompt: 'sys-new', response: 'resp-new' }),
    ]);
    const { container } = await mounted('old');

    const cmpNew = await compare(container, 'new');
    expect(cmpNew.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-ega-audit-diff-modal]')).toBeNull();

    await compare(container, 'old');
    const modal = await waitFor(() => {
      const m = document.querySelector('[data-ega-audit-diff-modal]');
      if (!m) throw new Error('diff modal not mounted');
      return m as HTMLElement;
    });
    expect(document.querySelector('[data-ega-diff-system-left]')?.textContent).toBe('sys-old');
    expect(document.querySelector('[data-ega-diff-system-right]')?.textContent).toBe('sys-new');
    expect(modal.closest('.ega-dialog')?.textContent).toContain('Compare two requests');
    expect(
      container.querySelector('[data-ega-audit-compare="new"]')?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('the line asks for a second request, and Cancel clears the pick', async () => {
    seed([makeEntry({ id: 'a', ts: 1000 }), makeEntry({ id: 'b', ts: 2000 })]);
    const { container } = await mounted('a');
    expect(container.querySelector('[data-ega-audit-compare-prompt]')).toBeNull();

    await compare(container, 'a');
    const prompt = await waitFor(() => {
      const p = container.querySelector('[data-ega-audit-compare-prompt]');
      if (!p) throw new Error('compare prompt not mounted');
      return p as HTMLElement;
    });
    expect(prompt.textContent).toContain('Pick a second request to compare');

    await fireEvent.click(
      container.querySelector('[data-ega-audit-compare-cancel]') as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-ega-audit-compare-prompt]')).toBeNull();
    });
    expect(
      container.querySelector('[data-ega-audit-compare="a"]')?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('"Show the first" scrolls the picked request into view', async () => {
    seed([makeEntry({ id: 'a' })]);
    const { container } = await mounted('a');
    await compare(container, 'a');
    const scrollBtn = await waitFor(() => {
      const el = container.querySelector('[data-ega-audit-compare-scroll]');
      if (!el) throw new Error('scroll-to-pinned button missing');
      return el as HTMLButtonElement;
    });
    expect(scrollBtn.textContent.trim()).toBe('Show the first');
    const entry = container.querySelector('[data-ega-audit-entry="a"]') as HTMLElement;
    const spy = vi.spyOn(entry, 'scrollIntoView').mockImplementation(() => {});
    await fireEvent.click(scrollBtn);
    expect(spy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    spy.mockRestore();
  });

  it('Compare on the same request twice cancels the pick', async () => {
    seed([makeEntry({ id: 'a' })]);
    const { container } = await mounted('a');
    const btn = await compare(container, 'a');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-ega-audit-diff-modal]')).toBeNull();
  });

  it('the close button drops the comparison', async () => {
    seed([makeEntry({ id: 'a', ts: 1000 }), makeEntry({ id: 'b', ts: 2000 })]);
    const { container } = await mounted('a');
    await compare(container, 'a');
    await compare(container, 'b');
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

  it('closes and says so when a compared request leaves the list', async () => {
    seed([makeEntry({ id: 'a', ts: 1000 }), makeEntry({ id: 'b', ts: 2000 })]);
    const { container } = await mounted('a');
    await compare(container, 'a');
    await compare(container, 'b');
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
});

describe('RequestAuditLog — tokens', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  const norm = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();

  async function open(container: HTMLElement, id: string): Promise<void> {
    await fireEvent.click(
      container.querySelector(
        `[data-ega-audit-entry="${id}"] [data-ega-audit-entry-toggle]`,
      ) as HTMLButtonElement,
    );
  }

  it('Details shows each row its token pair, and the list shows the total', async () => {
    seed([
      { ...makeEntry({ id: 'a' }), inputTokens: 1200, outputTokens: 30 },
      { ...makeEntry({ id: 'b' }), inputTokens: 50, outputTokens: 10 },
      makeEntry({ id: 'c', cacheHit: true }),
    ]);
    const { container } = await mounted('a');
    for (const id of ['a', 'b', 'c']) await open(container, id);
    const pair = (id: string) =>
      norm(container.querySelector(`[data-ega-audit-entry="${id}"] .entry-tokens`)?.textContent);
    expect(pair('a')).toBe('1,200 in · 30 out');
    expect(pair('b')).toBe('50 in · 10 out');
    expect(container.querySelector('[data-ega-audit-entry="c"] .entry-tokens')).toBeNull();
    expect(norm(container.querySelector('.token-total')?.textContent)).toBe(
      'Tokens in this list: 1,250 in · 40 out',
    );
  });

  it('shows no total when no row reports tokens, and skips a stored value that is not a number', async () => {
    seed([
      makeEntry({ id: 'a' }),
      { ...makeEntry({ id: 'b' }), inputTokens: 'lots' as unknown as number },
    ]);
    const { container } = await mounted('b');
    await open(container, 'b');
    expect(container.querySelector('.token-total')).toBeNull();
    expect(container.querySelector('[data-ega-audit-entry="b"] .entry-tokens')).toBeNull();
  });

  it('totals only the side some row reported, with no made-up zero', async () => {
    seed([
      { ...makeEntry({ id: 'a' }), inputTokens: 100 },
      { ...makeEntry({ id: 'b' }), inputTokens: 50 },
    ]);
    const { container } = await mounted('a');
    expect(norm(container.querySelector('.token-total')?.textContent)).toBe(
      'Tokens in this list: 150 in',
    );
  });
});
