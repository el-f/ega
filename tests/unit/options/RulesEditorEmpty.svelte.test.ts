// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import RulesEditorEmpty from '@/options/components/RulesEditorEmpty.svelte';

describe('RulesEditorEmpty', () => {
  it('mounts the empty state with an Add a rule button', async () => {
    const onAdd = vi.fn();
    const { container, getByRole } = render(RulesEditorEmpty, { props: { onAdd } });
    const empty = container.querySelector('[data-ega-rules-empty]');
    expect(empty?.textContent).toMatch(/No rules yet/);
    await fireEvent.click(getByRole('button', { name: 'Add a rule' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
