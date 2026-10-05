// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
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
  it('renders empty state when rules list is empty', () => {
    const { container, getByText } = render(RulesEditor, {
      props: { rules: [], onUpdate: () => {} },
    });
    expect(container.querySelector('[data-ega-rules-empty]')).not.toBeNull();
    expect(getByText(/No rules yet/i)).toBeTruthy();
  });

  it('renders every rule as an editable row, with no disclosure to open', () => {
    const r1 = rule({ id: 'r1', body: 'Always preserve URLs.', category: 'always' });
    const r2 = rule({ id: 'r2', body: 'Prefer short sentences.', category: 'prefer' });
    const { container } = render(RulesEditor, {
      props: { rules: [r1, r2], onUpdate: () => {} },
    });
    const rows = container.querySelectorAll('[data-ega-rule-row]');
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute('data-rule-id')).toBe('r1');
    expect(rows[1]?.getAttribute('data-rule-id')).toBe('r2');
    expect(container.querySelector('[data-ega-advanced-rules]')).toBeNull();
  });

  it('Delete removes the rule at once, with no confirm, and offers Undo', async () => {
    vi.mocked(confirmDialog).mockClear();
    const pushSpy = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const r1 = rule({ id: 'r1' });
    const r2 = rule({ id: 'r2' });
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container } = render(RulesEditor, {
      props: { rules: [r1, r2], onUpdate },
    });
    const delBtn = container.querySelector<HTMLButtonElement>(
      '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-delete]',
    );
    if (!delBtn) throw new Error('expected delete button');
    await fireEvent.click(delBtn);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0].map((r) => r.id)).toEqual(['r2']);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(pushSpy.mock.calls[0]?.[0].action?.label).toBe('Undo');
    pushSpy.mockRestore();
  });

  it('the On checkbox keeps one name and flips enabled', async () => {
    const r1 = rule({ id: 'r1', enabled: true });
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container, getByRole } = render(RulesEditor, {
      props: { rules: [r1], onUpdate },
    });
    const toggle = getByRole('checkbox', { name: 'On' });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    await fireEvent.click(toggle);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0][0]?.enabled).toBe(false);
    expect(container.querySelector('[data-ega-rule-off]')).toBeNull();
  });

  it('a disabled rule shows an Off badge instead of fading', () => {
    const r1 = rule({ id: 'r1', enabled: false });
    const { container } = render(RulesEditor, { props: { rules: [r1], onUpdate: () => {} } });
    expect(container.querySelector('[data-ega-rule-off]')?.textContent).toContain('Off');
  });

  it('inline body edit calls onUpdate with the body changed and shows Saved', async () => {
    const r1 = rule({ id: 'r1', body: 'Old body.' });
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container, findByText } = render(RulesEditor, {
      props: { rules: [r1], onUpdate },
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
    expect(await findByText('Saved')).toBeTruthy();
  });

  it('the empty state offers Add a rule, which opens the form', async () => {
    const { container, getByRole } = render(RulesEditor, {
      props: { rules: [], onUpdate: () => {} },
    });
    expect(container.querySelector<HTMLDetailsElement>('details.manual-block')?.open).toBe(false);
    await fireEvent.click(getByRole('button', { name: 'Add a rule' }));
    await waitFor(() =>
      expect(container.querySelector<HTMLDetailsElement>('details.manual-block')?.open).toBe(true),
    );
  });

  it('Cancel closes the add form and clears it', async () => {
    const { container, getByRole } = render(RulesEditor, {
      props: { rules: [rule({ id: 'r1' })], onUpdate: () => {} },
    });
    const form = container.querySelector<HTMLDetailsElement>('details.manual-block');
    if (!form) throw new Error('expected form');
    // jsdom fires no toggle event for a summary click, so open it the way bind:open listens.
    form.open = true;
    await fireEvent(form, new Event('toggle'));
    const body = container.querySelector<HTMLTextAreaElement>('[data-ega-manual-body]');
    if (!body) throw new Error('expected body');
    await fireEvent.input(body, { target: { value: 'Never invent words.' } });
    expect(container.querySelector('.category-guess')?.textContent).toContain('never');
    await fireEvent.click(getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(form.open).toBe(false));
    expect(body.value).toBe('');
  });

  it('manual add form appends a rule with chosen scope', async () => {
    const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
    const { container } = render(RulesEditor, {
      props: { rules: [], onUpdate },
    });

    const cta = container.querySelector<HTMLButtonElement>('[data-ega-rules-empty] button');
    if (!cta) throw new Error('expected the empty-state button');
    await fireEvent.click(cta);
    await waitFor(() => expect(container.querySelector('[data-ega-manual-body]')).not.toBeNull());

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

  describe('Row scope chips', () => {
    async function openAdvancedRow(container: HTMLElement, id: string): Promise<void> {
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

    it('a live custom task keeps its remove button and its name', async () => {
      const shipped = SHIPPED_TASK_VIEWS[0];
      if (!shipped) throw new Error('no shipped views');
      const legal = { ...shipped, id: 'c-legal', kind: 'custom' as const, label: 'Legal' };
      const r1 = rule({ id: 'r1', scope: { tasks: ['c-legal'] } });
      const { container } = render(RulesEditor, {
        props: { rules: [r1], onUpdate: vi.fn(), taskViews: [...SHIPPED_TASK_VIEWS, legal] },
      });
      await openAdvancedRow(container, 'r1');
      const chip = container.querySelector(
        '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-task-chip="c-legal"]',
      );
      expect(chip?.tagName).toBe('BUTTON');
      expect(chip?.textContent).toContain('Legal');
    });

    it('a deleted task has no remove button, because an empty scope means every task', async () => {
      const r1 = rule({ id: 'r1', scope: { tasks: ['unknown-task'] } });
      const onUpdate = vi.fn();
      const { container } = render(RulesEditor, { props: { rules: [r1], onUpdate } });
      await openAdvancedRow(container, 'r1');

      const chip = container.querySelector(
        '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-task-chip="unknown-task"]',
      );
      expect(chip?.textContent).toContain('Deleted task');
      expect(chip?.tagName).not.toBe('BUTTON');
      expect(chip?.querySelector('button')).toBeNull();
    });

    it('the last task chip stays: the rule is not widened to every task, and a toast says how', async () => {
      const captured: ToastMsg[] = [];
      const pushSpy = vi.spyOn(toastStore, 'push').mockImplementation((entry) => {
        captured.push(entry);
      });
      const r1 = rule({ id: 'r1', scope: { tasks: ['translate'] } });
      const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
      const { container } = render(RulesEditor, { props: { rules: [r1], onUpdate } });
      await openAdvancedRow(container, 'r1');

      const chip = container.querySelector<HTMLButtonElement>(
        '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-task-chip="translate"]',
      );
      if (!chip) throw new Error('expected task chip');
      await fireEvent.click(chip);

      await waitFor(() => expect(captured.length).toBe(1));
      expect(captured[0]?.message).toMatch(/at least one task/i);
      expect(captured[0]?.message).toMatch(/edit scope/i);
      expect(onUpdate).not.toHaveBeenCalled();
      pushSpy.mockRestore();
    });

    it('Edit scope adds a task back to an all-tasks rule', async () => {
      const r1 = rule({ id: 'r1', scope: { tasks: [] } });
      const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
      const { container } = render(RulesEditor, { props: { rules: [r1], onUpdate } });
      await openAdvancedRow(container, 'r1');

      const edit = container.querySelector<HTMLButtonElement>(
        '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-edit-scope]',
      );
      if (!edit) throw new Error('expected Edit scope button');
      await fireEvent.click(edit);

      const box = await screen.findByRole('checkbox', { name: 'Translate' });
      await fireEvent.click(box);
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
      expect(onUpdate.mock.calls[0]?.[0][0]?.scope.tasks).toEqual(['translate']);
    });

    it('Edit scope keeps the last checked task checked; All tasks is the explicit way to widen', async () => {
      const r1 = rule({ id: 'r1', scope: { tasks: ['translate'] } });
      const onUpdate = vi.fn<(next: readonly Rule[]) => void>();
      const { container } = render(RulesEditor, { props: { rules: [r1], onUpdate } });
      await openAdvancedRow(container, 'r1');
      const edit = container.querySelector<HTMLButtonElement>('[data-ega-rule-edit-scope]');
      if (!edit) throw new Error('expected Edit scope button');
      await fireEvent.click(edit);

      const last = await screen.findByRole('checkbox', { name: 'Translate' });
      expect((last as HTMLInputElement).disabled).toBe(true);

      await fireEvent.click(screen.getByRole('checkbox', { name: 'All tasks' }));
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
      expect(onUpdate.mock.calls[0]?.[0][0]?.scope.tasks).toEqual([]);
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
        '[data-ega-rule-row][data-rule-id="r1"] [data-ega-rule-delete]',
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
        '[data-ega-rule-row][data-rule-id="r2"] [data-ega-rule-delete]',
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
