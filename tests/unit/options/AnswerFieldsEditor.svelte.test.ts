// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import AnswerFieldsEditor from '@/options/components/AnswerFieldsEditor.svelte';
import type { AnswerField } from '@/shared/answer/spec';

const main: AnswerField = {
  key: 'answer',
  label: 'Answer',
  kind: 'text',
  role: 'main',
  required: true,
};
const note = (key: string): AnswerField => ({
  key,
  label: key,
  kind: 'text',
  role: 'notes',
  required: false,
});
describe('answer field editing', () => {
  it('locks the main answer and keeps field keys when names change', async () => {
    let fields = [main, note('reason')];
    const change = vi.fn((next: AnswerField[]) => {
      fields = next;
      void view.rerender({ fields });
    });
    const view = render(AnswerFieldsEditor, { fields, onchange: change });
    expect(view.queryByRole('button', { name: 'Delete Answer' })).toBeNull();
    await fireEvent.click(view.getByRole('button', { name: 'Edit Answer' }));
    expect(view.getByText('Main answer · Always filled · Stays first')).toBeTruthy();
    expect(view.queryByLabelText('Shows as')).toBeNull();
    await fireEvent.click(view.getByRole('button', { name: 'Edit reason' }));
    await fireEvent.input(view.getByLabelText('Name'), { target: { value: 'Why this works' } });
    expect(fields[1]).toMatchObject({ key: 'reason', label: 'Why this works' });
  });
  it('reorders additional fields using the keyboard controls while main stays first', async () => {
    const onchange = vi.fn();
    const view = render(AnswerFieldsEditor, { fields: [main, note('one'), note('two')], onchange });
    await fireEvent.click(view.getByRole('button', { name: 'Move two up' }));
    expect(onchange.mock.calls[0]?.[0].map((f: AnswerField) => f.key)).toEqual([
      'answer',
      'two',
      'one',
    ]);
  });
  it('explains the field cap and adds nothing beyond eight fields', async () => {
    const onchange = vi.fn();
    const view = render(AnswerFieldsEditor, {
      fields: [main, ...Array.from({ length: 7 }, (_, i) => note(`field${i}`))],
      onchange,
    });
    const add = view.getByRole('button', { name: 'Add field' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(view.getByText('8 fields at most')).toBeTruthy();
    await fireEvent.click(add);
    await waitFor(() => expect(onchange).not.toHaveBeenCalled());
  });
});
