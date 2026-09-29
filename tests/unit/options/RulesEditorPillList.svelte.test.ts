// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import RulesEditorPillList from '@/options/components/RulesEditorPillList.svelte';
import type { Rule } from '@/shared/rules';

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: overrides.id ?? `r-${Math.random().toString(36).slice(2)}`,
    body: overrides.body ?? 'Always preserve URLs verbatim.',
    category: overrides.category ?? 'always',
    scope: overrides.scope ?? { tasks: [] },
    source: overrides.source ?? 'manual',
    addedAt: overrides.addedAt ?? '2026-05-09T00:00:00.000Z',
    enabled: overrides.enabled ?? true,
    ...(overrides.recipeId !== undefined ? { recipeId: overrides.recipeId } : {}),
  };
}

describe('RulesEditorPillList', () => {
  it('renders one pill per rule with the expected shape', () => {
    const r1 = rule({ id: 'r1', body: 'Always preserve URLs verbatim.', category: 'always' });
    const r2 = rule({ id: 'r2', body: 'Never use em-dashes.', category: 'never' });
    const { container } = render(RulesEditorPillList, {
      props: { rules: [r1, r2], onDelete: vi.fn(), onToggleEnabled: vi.fn() },
    });
    const pills = container.querySelectorAll('[data-ega-rule-pill]');
    expect(pills.length).toBe(2);
    expect(pills[0]?.getAttribute('data-rule-id')).toBe('r1');
    expect(pills[1]?.getAttribute('data-rule-id')).toBe('r2');
    // Category badge surfaces the enum value verbatim.
    expect(pills[0]?.querySelector('[data-ega-rule-pill-category]')?.textContent).toMatch(/always/);
    expect(pills[1]?.querySelector('[data-ega-rule-pill-category]')?.textContent).toMatch(/never/);
  });

  it('Delete pill ✕ fires onDelete directly — the parent owns the confirm', async () => {
    const r1 = rule({ id: 'r1' });
    const onDelete = vi.fn();
    const onToggleEnabled = vi.fn();
    const { container } = render(RulesEditorPillList, {
      props: { rules: [r1], onDelete, onToggleEnabled },
    });
    const delBtn = container.querySelector<HTMLButtonElement>(
      '[data-ega-rule-pill][data-rule-id="r1"] [data-ega-rule-pill-delete]',
    );
    if (!delBtn) throw new Error('expected pill delete button');
    await fireEvent.click(delBtn);
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith('r1');
  });

  it('Power pill ⏻ fires onToggleEnabled with rule id', async () => {
    const r1 = rule({ id: 'r1', enabled: true });
    const onDelete = vi.fn();
    const onToggleEnabled = vi.fn();
    const { container } = render(RulesEditorPillList, {
      props: { rules: [r1], onDelete, onToggleEnabled },
    });
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-ega-rule-pill][data-rule-id="r1"] [data-ega-rule-pill-disable]',
    );
    if (!toggle) throw new Error('expected pill toggle button');
    await fireEvent.click(toggle);
    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
    expect(onToggleEnabled).toHaveBeenCalledWith('r1');
  });

  it('disabled rule renders with the disabled marker class', () => {
    const r1 = rule({ id: 'r1', enabled: false });
    const { container } = render(RulesEditorPillList, {
      props: { rules: [r1], onDelete: vi.fn(), onToggleEnabled: vi.fn() },
    });
    const pill = container.querySelector('[data-ega-rule-pill][data-rule-id="r1"]');
    expect(pill).not.toBeNull();
    expect(pill?.classList.contains('disabled')).toBe(true);
  });

  it('renders correct source badge per source value', () => {
    const r1 = rule({ id: 'rA', source: 'describe' });
    const r2 = rule({ id: 'rB', source: 'recipe', recipeId: 'formal' });
    const r4 = rule({ id: 'rD', source: 'manual' });
    const { container } = render(RulesEditorPillList, {
      props: { rules: [r1, r2, r4], onDelete: vi.fn(), onToggleEnabled: vi.fn() },
    });
    const sourceFor = (id: string): string => {
      const el = container.querySelector(`[data-rule-id="${id}"] [data-ega-rule-pill-source]`);
      return (el?.textContent ?? '').trim();
    };
    expect(sourceFor('rA')).toMatch(/AI/);
    expect(sourceFor('rB')).toMatch(/formal/);
    expect(sourceFor('rD')).toMatch(/manual/);
  });
});
