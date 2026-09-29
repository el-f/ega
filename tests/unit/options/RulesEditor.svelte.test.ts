// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import RulesEditor from '@/options/components/RulesEditor.svelte';
import type { Rule } from '@/shared/rules';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';

// Auto-accept destructive confirm so [Delete] flows resolve in tests.
vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));
import { confirmDialog } from '@/shared/components/confirmDialog';

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: overrides.id ?? `r-${Math.random().toString(36).slice(2)}`,
    body: overrides.body ?? 'Never invent words.',
    category: overrides.category ?? 'never',
    scope: overrides.scope ?? { tasks: [] },
    source: overrides.source ?? 'manual',
    addedAt: overrides.addedAt ?? '2026-05-09T00:00:00.000Z',
    enabled: overrides.enabled ?? true,
    ...(overrides.recipeId !== undefined ? { recipeId: overrides.recipeId } : {}),
  };
}

describe('RulesEditor', () => {
  // Opening the disclosure persists to localStorage — scrub so every test starts closed.
  afterEach(() => {
    globalThis.localStorage.removeItem('ega.advanced-rules-disclosure');
  });

  it('renders empty state when rules list is empty', () => {
    const { container, getByText } = render(RulesEditor, {
      props: { rules: [], onUpdate: () => {} },
    });
    expect(container.querySelector('[data-ega-rules-empty]')).not.toBeNull();
    expect(getByText(/No rules yet/i)).toBeTruthy();
  });

  it('renders one pill per rule under Active rules', () => {
    const r1 = rule({ id: 'r1', body: 'Always preserve URLs.', category: 'always' });
    const r2 = rule({ id: 'r2', body: 'Prefer short sentences.', category: 'prefer' });
    const { container } = render(RulesEditor, {
      props: { rules: [r1, r2], onUpdate: () => {} },
    });
    const pills = container.querySelectorAll('[data-ega-rule-pill]');
    expect(pills.length).toBe(2);
    expect(pills[0]?.getAttribute('data-rule-id')).toBe('r1');
    expect(pills[1]?.getAttribute('data-rule-id')).toBe('r2');
  });

  it('Pill ✕ calls onUpdate with that rule removed', async () => {
    const r1 = rule({ id: 'r1' });
    const r2 = rule({ id: 'r2' });
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container } = render(RulesEditor, {
      props: { rules: [r1, r2], onUpdate },
    });
    const delBtn = container.querySelector<HTMLButtonElement>(
      '[data-ega-rule-pill][data-rule-id="r1"] [data-ega-rule-pill-delete]',
    );
    if (!delBtn) throw new Error('expected pill delete button');
    await fireEvent.click(delBtn);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const next = onUpdate.mock.calls[0]?.[0];
    expect(next?.length).toBe(1);
    expect(next?.[0]?.id).toBe('r2');
  });

  it('Pill ✕ asks for confirmation exactly once', async () => {
    vi.mocked(confirmDialog).mockClear();
    const r1 = rule({ id: 'r1' });
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container } = render(RulesEditor, {
      props: { rules: [r1], onUpdate },
    });
    const delBtn = container.querySelector<HTMLButtonElement>(
      '[data-ega-rule-pill][data-rule-id="r1"] [data-ega-rule-pill-delete]',
    );
    if (!delBtn) throw new Error('expected pill delete button');
    await fireEvent.click(delBtn);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(confirmDialog).toHaveBeenCalledTimes(1);
  });

  it('open Advanced disclosure replaces the pill list — each rule renders once', async () => {
    const r1 = rule({ id: 'r1' });
    const { container } = render(RulesEditor, {
      props: { rules: [r1], onUpdate: () => {} },
    });
    expect(container.querySelectorAll('[data-ega-rule-pill]').length).toBe(1);

    const details = container.querySelector<HTMLDetailsElement>('[data-ega-advanced-rules]');
    if (!details) throw new Error('expected advanced rules disclosure');
    details.open = true;
    await fireEvent(details, new Event('toggle'));

    await waitFor(() => {
      expect(container.querySelectorAll('[data-ega-rule-pill]').length).toBe(0);
    });
    expect(container.querySelector('[data-ega-rule-row][data-rule-id="r1"]')).not.toBeNull();
  });

  it('Pill ⏻ toggle calls onUpdate with enabled flipped to false', async () => {
    const r1 = rule({ id: 'r1', enabled: true });
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container } = render(RulesEditor, {
      props: { rules: [r1], onUpdate },
    });
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-ega-rule-pill][data-rule-id="r1"] [data-ega-rule-pill-disable]',
    );
    if (!toggle) throw new Error('expected pill toggle');
    await fireEvent.click(toggle);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const next = onUpdate.mock.calls[0]?.[0];
    expect(next?.[0]?.enabled).toBe(false);
  });

  it('DescribeYourChange.onRuleAdded calls onUpdate with rule appended', async () => {
    const sendMessage = chrome.runtime.sendMessage as unknown as Mock;
    sendMessage.mockRejectedValue(new Error('no handler'));

    const r1 = rule({ id: 'r1' });
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container } = render(RulesEditor, {
      props: { rules: [r1], onUpdate },
    });

    const input = container.querySelector<HTMLInputElement>('[data-ega-describe-input]');
    const apply = container.querySelector<HTMLButtonElement>('[data-ega-describe-apply]');
    if (!input || !apply) throw new Error('expected DescribeYourChange input + apply');

    await fireEvent.input(input, { target: { value: 'always cite sources' } });
    await fireEvent.click(apply);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const next = onUpdate.mock.calls[0]?.[0];
    expect(next?.length).toBe(2);
    expect(next?.[0]?.id).toBe('r1');
    expect(next?.[1]?.body).toBe('always cite sources');
    expect(next?.[1]?.category).toBe('always');
  });

  it('Advanced disclosure: inline body edit calls onUpdate with body changed', async () => {
    const r1 = rule({ id: 'r1', body: 'Old body.' });
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container } = render(RulesEditor, {
      props: { rules: [r1], onUpdate },
    });

    // Open the Advanced rules disclosure first — the row editor only mounts inside it.
    const details = container.querySelector<HTMLDetailsElement>('[data-ega-advanced-rules]');
    if (!details) throw new Error('expected advanced rules disclosure');
    details.open = true;

    await waitFor(() => {
      expect(
        container.querySelector('[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-body]'),
      ).not.toBeNull();
    });

    const bodyEl = container.querySelector<HTMLElement>(
      '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-body]',
    );
    if (!bodyEl) throw new Error('expected rule body element');
    await fireEvent.click(bodyEl);

    const editor = container.querySelector<HTMLTextAreaElement>(
      '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-body-editor]',
    );
    if (!editor) throw new Error('expected body editor textarea');

    await fireEvent.input(editor, { target: { value: 'New body.' } });
    await fireEvent.blur(editor);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const next = onUpdate.mock.calls[0]?.[0];
    expect(next?.[0]?.body).toBe('New body.');
    expect(next?.[0]?.id).toBe('r1');
  });

  it('Advanced disclosure: manual add form appends a rule with chosen scope', async () => {
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container } = render(RulesEditor, {
      props: { rules: [], onUpdate },
    });

    const details = container.querySelector<HTMLDetailsElement>('[data-ega-advanced-rules]');
    if (!details) throw new Error('expected advanced rules disclosure');
    details.open = true;

    // Open the inner manual-block <details> wrapper too — its summary stays collapsed by default.
    const manualOpen = container.querySelector<HTMLDetailsElement>('details.manual-block');
    if (!manualOpen) throw new Error('expected manual-block details');
    manualOpen.open = true;

    const bodyInput = container.querySelector<HTMLTextAreaElement>('[data-ega-manual-body]');
    const sitesInput = container.querySelector<HTMLInputElement>('[data-ega-manual-sites]');
    const taskChip = container.querySelector<HTMLButtonElement>(
      '[data-ega-manual-task="translate"]',
    );
    const submit = container.querySelector<HTMLButtonElement>('[data-ega-manual-submit]');
    if (!bodyInput || !sitesInput || !taskChip || !submit) {
      throw new Error('expected manual form controls');
    }

    await fireEvent.input(bodyInput, { target: { value: 'Format: bullet list.' } });
    await fireEvent.click(taskChip);
    await fireEvent.input(sitesInput, { target: { value: 'twitter.com, example.com' } });
    await fireEvent.click(submit);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const next = onUpdate.mock.calls[0]?.[0];
    expect(next?.length).toBe(1);
    const added = next?.[0];
    expect(added?.body).toBe('Format: bullet list.');
    expect(added?.category).toBe('format');
    expect(added?.scope.tasks).toEqual(['translate']);
    expect(added?.scope.sites).toEqual(['twitter.com', 'example.com']);
    expect(added?.source).toBe('manual');
  });

  describe('Advanced row scope chips', () => {
    async function openAdvancedRow(container: HTMLElement, id: string): Promise<void> {
      const details = container.querySelector<HTMLDetailsElement>('[data-ega-advanced-rules]');
      if (!details) throw new Error('expected advanced rules disclosure');
      details.open = true;
      await waitFor(() => {
        expect(container.querySelector(`[data-ega-rule-row][data-rule-id="${id}"]`)).not.toBeNull();
      });
    }

    it('scope chips carry an accessible Remove name for task and site', async () => {
      const r1 = rule({ id: 'r1', scope: { tasks: ['translate'], sites: ['twitter.com'] } });
      const { container } = render(RulesEditor, {
        props: { rules: [r1], onUpdate: () => {} },
      });
      await openAdvancedRow(container, 'r1');

      const taskChip = container.querySelector<HTMLButtonElement>(
        '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-task-chip="translate"]',
      );
      const siteChip = container.querySelector<HTMLButtonElement>(
        '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-site-chip="twitter.com"]',
      );
      if (!taskChip || !siteChip) throw new Error('expected task + site chips');
      // aria-label must name the remove intent + the real value, not rely on title only.
      expect(taskChip.getAttribute('aria-label')).toMatch(/^Remove task /);
      expect(siteChip.getAttribute('aria-label')).toBe('Remove site twitter.com');
    });

    it('removing a site chip pushes an Undo toast that restores the scope', async () => {
      resetChromeMock();
      const captured: ToastMsg[] = [];
      const pushSpy = vi.spyOn(toastStore, 'push').mockImplementation((entry) => {
        captured.push(entry);
      });

      const r1 = rule({ id: 'r1', scope: { tasks: ['translate'], sites: ['twitter.com'] } });
      const seeded: Settings = {
        ...DEFAULT_SETTINGS,
        advanced: { ...DEFAULT_SETTINGS.advanced, rules: [r1] },
      };
      chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, seeded);

      const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
      const { container } = render(RulesEditor, { props: { rules: [r1], onUpdate } });
      await openAdvancedRow(container, 'r1');

      const siteChip = container.querySelector<HTMLButtonElement>(
        '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-site-chip="twitter.com"]',
      );
      if (!siteChip) throw new Error('expected site chip');
      await fireEvent.click(siteChip);

      // Site removed → onUpdate fired with sites gone.
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
      const afterRemove = onUpdate.mock.calls[0]?.[0];
      expect(afterRemove?.[0]?.scope.sites).toBeUndefined();

      // An Undo toast was pushed for the proportional recovery path.
      await waitFor(() => expect(captured.length).toBeGreaterThanOrEqual(1));
      const undo = captured[0]?.action?.onClick;
      expect(captured[0]?.action?.label).toBe('Undo');
      expect(typeof undo).toBe('function');

      // Undo re-reads canonical storage and restores the prior scope.
      onUpdate.mockClear();
      undo?.();
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
      const restored = onUpdate.mock.calls[0]?.[0];
      expect(restored?.[0]?.scope.sites).toEqual(['twitter.com']);

      pushSpy.mockRestore();
    });
  });

  describe('Undo restore from delete-A → delete-B → Undo A', () => {
    beforeEach(() => {
      resetChromeMock();
    });

    it('Undo splices into the canonical storage rules, not the stale closure', async () => {
      // Undo after a second delete must splice into the current list, not the one captured at delete time.
      const captured: ToastMsg[] = [];
      const pushSpy = vi.spyOn(toastStore, 'push').mockImplementation((entry) => {
        captured.push(entry);
      });

      const r1: Rule = {
        id: 'r1',
        body: 'Always preserve URLs.',
        category: 'always',
        scope: { tasks: [] },
        source: 'manual',
        addedAt: '2026-05-09T00:00:00.000Z',
        enabled: true,
      };
      const r2: Rule = {
        id: 'r2',
        body: 'Prefer short sentences.',
        category: 'prefer',
        scope: { tasks: [] },
        source: 'manual',
        addedAt: '2026-05-09T00:00:00.000Z',
        enabled: true,
      };
      const r3: Rule = {
        id: 'r3',
        body: 'Never abbreviate.',
        category: 'never',
        scope: { tasks: [] },
        source: 'manual',
        addedAt: '2026-05-09T00:00:00.000Z',
        enabled: true,
      };

      // Seed canonical settings with all three rules — getSettings()
      // inside the Undo handler reads from here at click time.
      const seeded: Settings = {
        ...DEFAULT_SETTINGS,
        advanced: { ...DEFAULT_SETTINGS.advanced, rules: [r1, r2, r3] },
      };
      chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, seeded);

      const onUpdate = vi.fn<(next: readonly Rule[]) => void>();

      // Render with all three rules visible.
      const { container, rerender } = render(RulesEditor, {
        props: { rules: [r1, r2, r3], onUpdate },
      });

      // Delete r1 — capture toast A.
      const del1 = container.querySelector<HTMLButtonElement>(
        '[data-ega-rule-pill][data-rule-id="r1"] [data-ega-rule-pill-delete]',
      );
      if (!del1) throw new Error('expected pill delete button for r1');
      await fireEvent.click(del1);
      await waitFor(() => expect(captured.length).toBeGreaterThanOrEqual(1));

      const toastA = captured[0];
      const undoA = toastA?.action?.onClick;
      expect(typeof undoA).toBe('function');

      // Simulate parent writeback after first delete — storage now [r2, r3].
      chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
        ...seeded,
        advanced: { ...seeded.advanced, rules: [r2, r3] },
      });
      await rerender({ rules: [r2, r3], onUpdate });

      // Delete r2 — second toast pushed.
      const del2 = container.querySelector<HTMLButtonElement>(
        '[data-ega-rule-pill][data-rule-id="r2"] [data-ega-rule-pill-delete]',
      );
      if (!del2) throw new Error('expected pill delete button for r2');
      await fireEvent.click(del2);
      await waitFor(() => expect(captured.length).toBeGreaterThanOrEqual(2));

      // Simulate parent writeback after second delete — storage now [r3].
      chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
        ...seeded,
        advanced: { ...seeded.advanced, rules: [r3] },
      });
      await rerender({ rules: [r3], onUpdate });

      // Trigger Undo A. onUpdate calls so far: deleteR1 + deleteR2 (=2).
      onUpdate.mockClear();
      undoA?.();
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

      // The post-Undo list MUST be [r1, r3] (r2 stays deleted) — NOT the
      // pre-r2-delete [r1, r2, r3] which the buggy closure would restore.
      const restored = onUpdate.mock.calls[0]?.[0];
      const ids = restored?.map((r) => r.id);
      expect(ids).toEqual(['r1', 'r3']);

      pushSpy.mockRestore();
    });
  });
});
