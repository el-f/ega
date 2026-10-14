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
  it('adds a field with a fresh key, focuses its name, and deletes the open field', async () => {
    let fields = [main, note('field1')];
    const onchange = (next: AnswerField[]) => {
      fields = next;
      void view.rerender({ fields });
    };
    const view = render(AnswerFieldsEditor, { fields, onchange });
    await fireEvent.click(view.getByRole('button', { name: 'Add field' }));
    await waitFor(() => expect(document.activeElement).toBe(view.getByLabelText('Name')));
    expect(fields[2]).toMatchObject({
      key: 'field2',
      label: 'Field 2',
      role: 'notes',
      required: false,
    });
    await fireEvent.click(view.getByRole('button', { name: 'Delete Field 2' }));
    expect(fields.map((f) => f.key)).toEqual(['answer', 'field1']);
    expect(view.queryByLabelText('Name')).toBeNull();
  });
  it('edits a choice, its placement, requirement and guidance without changing its key', async () => {
    let fields = [main, note('tone')];
    const onchange = (next: AnswerField[]) => {
      fields = next;
      void view.rerender({ fields });
    };
    const view = render(AnswerFieldsEditor, { fields, onchange });
    await fireEvent.click(view.getByRole('button', { name: 'Edit tone' }));
    await fireEvent.change(view.getByLabelText('Kind'), { target: { value: 'choice' } });
    expect(fields[1]?.choices).toEqual(['Option 1', 'Option 2']);
    await fireEvent.input(view.getByLabelText('Choices, separated by commas'), {
      target: { value: 'Formal, Casual' },
    });
    await fireEvent.change(view.getByLabelText('Shows as'), { target: { value: 'hidden' } });
    await fireEvent.click(view.getByLabelText('Always fill it'));
    await fireEvent.input(view.getByLabelText('What goes here'), {
      target: { value: 'Classify the writing style.' },
    });
    expect(fields[1]).toMatchObject({
      key: 'tone',
      kind: 'choice',
      choices: ['Formal', 'Casual'],
      role: 'hidden',
      required: true,
      guide: 'Classify the writing style.',
    });
    expect(view.getByText('The model still writes it, which can improve the answer.')).toBeTruthy();
    await fireEvent.click(view.getByRole('button', { name: 'Edit tone' }));
    expect(view.queryByLabelText('Kind')).toBeNull();
  });
  it('can make the main answer a list while keeping it required and first', async () => {
    const onchange = vi.fn();
    const view = render(AnswerFieldsEditor, { fields: [main, note('reason')], onchange });
    await fireEvent.click(view.getByRole('button', { name: 'Edit Answer' }));
    expect(
      [...(view.getByLabelText('Kind') as HTMLSelectElement).options].map((o) => o.value),
    ).toEqual(['text', 'list']);
    await fireEvent.change(view.getByLabelText('Kind'), { target: { value: 'list' } });
    expect(onchange.mock.calls[0]?.[0][0]).toMatchObject({ ...main, kind: 'list' });
  });
  it('commits a drag reorder without moving main or discarding field guidance', async () => {
    const one = { ...note('one'), guide: 'Preserve this.' };
    const two = note('two');
    const onchange = vi.fn();
    const view = render(AnswerFieldsEditor, { fields: [main, one, two], onchange });
    const list = view.getByRole('list', { name: 'Additional answer fields' });
    await fireEvent(
      list,
      new CustomEvent('finalize', {
        detail: {
          info: { source: 'keyboard', trigger: 'droppedIntoZone', id: 'two' },
          items: [
            { ...two, id: two.key },
            { ...one, id: one.key },
          ],
        },
      }),
    );
    expect(onchange).toHaveBeenLastCalledWith([main, two, one]);
  });
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
