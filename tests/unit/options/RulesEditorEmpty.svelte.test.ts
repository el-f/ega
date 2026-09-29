// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import RulesEditorEmpty from '@/options/components/RulesEditorEmpty.svelte';

describe('RulesEditorEmpty', () => {
  it('mounts the empty-state with no CTA when handler is absent', () => {
    const { container } = render(RulesEditorEmpty, { props: {} });
    const empty = container.querySelector('[data-ega-rules-empty]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toMatch(/No rules yet/);
    expect(container.querySelector('.cta')).toBeNull();
  });

  it('renders Pick a recipe CTA when handler is supplied + fires it on click', async () => {
    const onJumpToRecipes = vi.fn();
    const { container } = render(RulesEditorEmpty, { props: { onJumpToRecipes } });
    const cta = container.querySelector('[data-ega-empty-state] .cta') as HTMLButtonElement | null;
    expect(cta).not.toBeNull();
    expect(cta?.textContent).toMatch(/Pick a recipe/);
    await fireEvent.click(cta as HTMLButtonElement);
    expect(onJumpToRecipes).toHaveBeenCalledTimes(1);
  });
});
