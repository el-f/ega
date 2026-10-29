// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
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

/** Renders the editor the way the dialog does: each change comes back as the new fields. */
function live(initial: AnswerField[]) {
  let fields = initial;
  const onchange = vi.fn((next: AnswerField[]) => {
    fields = next;
    void view.rerender({ fields });
  });
  const view = render(AnswerFieldsEditor, { fields, onchange });
  return { view, onchange, fields: () => fields };
}

async function openMore(name: string): Promise<HTMLElement> {
  const trigger = document.querySelector<HTMLElement>(`[aria-label="More for ${name}"]`);
  if (!trigger) throw new Error(`no More for ${name}`);
  await fireEvent.keyDown(trigger, { key: 'Enter' });
  return waitFor(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) throw new Error('menu not open');
    return menu;
  });
}

const rowText = (key: string): string =>
  document.querySelector(`[data-ega-answer-field="${key}"] .af-summary`)?.textContent ?? '';

describe('a field row', () => {
  it('reads as its name and one plain line, never a key or a type', async () => {
    const points: AnswerField = { ...note('points'), label: 'Key points', kind: 'list' };
    const tone: AnswerField = {
      ...note('tone'),
      label: 'Tone',
      kind: 'choice',
      role: 'details',
      choices: ['Formal', 'Casual'],
    };
    const { view } = live([main, points, tone]);
    expect(rowText('answer')).toContain('Text · main answer');
    expect(rowText('points')).toContain('List · notes · optional');
    expect(rowText('tone')).toContain('Pick one · about this reply · optional');
    await fireEvent.click(view.getByRole('button', { name: 'Edit Key points' }));
    expect(view.container.textContent).not.toMatch(/JSON|key|array|string/);
  });

  it('has one action row: Edit, which turns into Close in place, and More', async () => {
    const { view } = live([main, note('tone')]);
    const row = document.querySelector('[data-ega-answer-field="tone"]') as HTMLElement;
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.textContent.trim()),
    ).toEqual(['Edit', '']);
    const edit = view.getByRole('button', { name: 'Edit tone' });
    expect(
      [...edit.querySelectorAll('[data-label]')].map((s) => s.getAttribute('data-label')),
    ).toEqual(['Edit', 'Close']);
    await fireEvent.click(edit);
    expect(edit.getAttribute('aria-expanded')).toBe('true');
    expect(view.getByRole('button', { name: 'Close tone' })).toBe(edit);
    await fireEvent.click(edit);
    expect(edit.getAttribute('aria-expanded')).toBe('false');
    expect(view.queryByLabelText('Kind')).toBeNull();
    const mainRow = document.querySelector('[data-ega-answer-field="answer"]') as HTMLElement;
    expect(within(mainRow).getAllByRole('button')).toHaveLength(1);
  });

  it('More moves a field up or down and deletes it; the ends are dimmed, not gone', async () => {
    const { fields } = live([main, note('one'), note('two')]);
    let menu = await openMore('one');
    const up = within(menu).getByRole('menuitem', { name: 'Move up' });
    expect(up.getAttribute('aria-disabled') ?? up.getAttribute('data-disabled')).not.toBeNull();
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move down' }));
    expect(fields().map((f) => f.key)).toEqual(['answer', 'two', 'one']);
    menu = await openMore('two');
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    expect(fields().map((f) => f.key)).toEqual(['answer', 'one']);
    await waitFor(() => expect(document.activeElement?.textContent.trim()).toBe('Add field'));
  });
});

describe('the field editor', () => {
  it('adds a field with a fresh key, focuses its name, and deletes the open field', async () => {
    const { view, fields } = live([main, note('field1')]);
    await fireEvent.click(view.getByRole('button', { name: 'Add field' }));
    await waitFor(() => expect(document.activeElement).toBe(view.getByLabelText('Name')));
    expect(fields()[2]).toMatchObject({
      key: 'field2',
      label: 'Field 2',
      role: 'notes',
      required: false,
    });
    const menu = await openMore('Field 2');
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    expect(fields().map((f) => f.key)).toEqual(['answer', 'field1']);
    expect(view.queryByLabelText('Name')).toBeNull();
  });

  it('edits a choice, its placement, requirement and guidance', async () => {
    const { view, fields } = live([main, note('tone')]);
    await fireEvent.click(view.getByRole('button', { name: 'Edit tone' }));
    const kind = view.getByLabelText('Kind') as HTMLSelectElement;
    expect([...kind.options].map((o) => o.textContent.trim())).toEqual([
      'Text',
      'List',
      'Yes or no',
      'Pick one',
      'Score (0 to 100%)',
    ]);
    await fireEvent.change(kind, { target: { value: 'choice' } });
    expect(fields()[1]?.choices).toEqual(['Option 1', 'Option 2']);
    await fireEvent.input(view.getByLabelText('Choices, separated by commas'), {
      target: { value: 'Formal, Casual' },
    });
    expect(view.getAllByRole('radio').map((r) => r.closest('label')?.textContent.trim())).toEqual([
      'Notes',
      'About this reply',
      'Not shown',
    ]);
    await fireEvent.click(view.getByRole('radio', { name: 'Not shown' }));
    await fireEvent.click(view.getByLabelText('Required'));
    const guide = view.getByLabelText('What goes here') as HTMLInputElement;
    expect(guide.placeholder).toBe('Tell the model what to put here');
    await fireEvent.input(guide, { target: { value: 'Classify the writing style.' } });
    expect(fields()[1]).toMatchObject({
      key: 'tone',
      kind: 'choice',
      choices: ['Formal', 'Casual'],
      role: 'hidden',
      required: true,
      guide: 'Classify the writing style.',
    });
    expect(view.getByText('The model still writes it, which can improve the answer')).toBeTruthy();
    expect(rowText('tone')).toContain('Pick one · not shown');
  });

  it('the main answer shows its facts once and its Kind as two choices, Text and List', async () => {
    const { view, fields } = live([main, note('reason')]);
    await fireEvent.click(view.getByRole('button', { name: 'Edit Answer' }));
    expect(view.container.textContent).not.toContain('Always filled');
    expect(view.container.querySelector('select')).toBeNull();
    expect(view.queryByRole('radio', { name: 'Notes' })).toBeNull();
    expect(view.queryByLabelText('Required')).toBeNull();
    const kinds = view.getAllByRole('radio').map((r) => r.closest('label')?.textContent.trim());
    expect(kinds).toEqual(['Text', 'List']);
    await fireEvent.click(view.getByRole('radio', { name: 'List' }));
    expect(fields()[0]).toMatchObject({ ...main, kind: 'list' });
    expect(rowText('answer')).toContain('List · main answer');
  });

  it('a renamed field takes its key from the new name, and the open name box keeps focus', async () => {
    const { view, fields } = live([main, note('field1'), note('tone')]);
    await fireEvent.click(view.getByRole('button', { name: 'Edit field1' }));
    const name = view.getByLabelText('Name');
    name.focus();
    await fireEvent.input(name, { target: { value: 'Tone' } });
    await tick();
    expect(fields().map((f) => f.key)).toEqual(['answer', 'tone2', 'tone']);
    expect(document.activeElement).toBe(name);
    expect(name.isConnected).toBe(true);
    await fireEvent.input(name, { target: { value: 'Key points' } });
    await tick();
    expect(fields()[1]).toMatchObject({ key: 'keyPoints', label: 'Key points' });
    expect(document.activeElement).toBe(name);
  });

  it('a rename that builds the same key keeps it, so the prompt line does not change', async () => {
    const { view, fields } = live([main, { ...note('tone'), label: 'Tone' }]);
    await fireEvent.click(view.getByRole('button', { name: 'Edit Tone' }));
    for (const value of ['tone', 'Tone ', 'Tone:']) {
      await fireEvent.input(view.getByLabelText('Name'), { target: { value } });
      expect(fields()[1]).toMatchObject({ key: 'tone', label: value });
    }
  });

  it('a key named like a built-in object method still gives its row a plain id', async () => {
    const { view } = live([
      main,
      { ...note('valueOf'), label: 'Value of' },
      { ...note('toString'), label: 'value of' },
    ]);
    for (const name of ['Value of', 'value of']) {
      const edit = view.getByRole('button', { name: `Edit ${name}` });
      await fireEvent.click(edit);
      const controls = edit.getAttribute('aria-controls') ?? '';
      expect(controls).toMatch(/^\S+$/);
      expect(document.getElementById(controls)).not.toBeNull();
      const described = view.getByLabelText('Name').getAttribute('aria-describedby') ?? '';
      expect(described).toMatch(/^\S+$/);
      expect(document.getElementById(described)?.textContent).toBe(
        'Two fields have this name. Rename one.',
      );
      await fireEvent.click(edit);
    }
  });

  it('a main answer keeps its key when renamed', async () => {
    const { view, fields } = live([main, note('tone')]);
    await fireEvent.click(view.getByRole('button', { name: 'Edit Answer' }));
    await fireEvent.input(view.getByLabelText('Name'), { target: { value: 'Outline' } });
    expect(fields()[0]).toMatchObject({ key: 'answer', label: 'Outline' });
  });

  it('a notes field kept under the explain key gets a key of its own once it stops being text notes', async () => {
    const { view, fields } = live([main, { ...note('explain'), label: 'Notes' }]);
    await fireEvent.click(view.getByRole('button', { name: 'Edit Notes' }));
    await fireEvent.change(view.getByLabelText('Kind'), { target: { value: 'list' } });
    expect(fields()[1]).toMatchObject({ key: 'notes', kind: 'list', label: 'Notes' });
  });

  it('commits a drag reorder without moving main or discarding field guidance', async () => {
    const one = { ...note('one'), guide: 'Preserve this.' };
    const two = note('two');
    const onchange = vi.fn();
    const view = render(AnswerFieldsEditor, { fields: [main, one, two], onchange });
    const list = view.getByRole('list', { name: 'More fields' });
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

describe('a field that needs a fix says so at the field', () => {
  it('marks both fields that share a name, under each row and under the open name box', async () => {
    const { view } = live([
      main,
      { ...note('tone'), label: 'Tone' },
      { ...note('tone2'), label: 'tone' },
    ]);
    for (const key of ['tone', 'tone2'])
      expect(document.querySelector(`[data-ega-answer-field="${key}"]`)?.textContent).toContain(
        'Two fields have this name',
      );
    await fireEvent.click(view.getByRole('button', { name: 'Edit Tone' }));
    const name = view.getByLabelText('Name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Two fields have this name. Rename one.',
    );
  });

  it('an empty name and too few choices show under their inputs', async () => {
    const { view } = live([main, { ...note('tone'), label: 'Tone' }]);
    await fireEvent.click(view.getByRole('button', { name: 'Edit Tone' }));
    await fireEvent.change(view.getByLabelText('Kind'), { target: { value: 'choice' } });
    const choices = view.getByLabelText('Choices, separated by commas');
    await fireEvent.input(choices, { target: { value: 'Formal' } });
    expect(choices.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(choices.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Add 2 to 12 different choices');
    const name = view.getByLabelText('Name');
    await fireEvent.input(name, { target: { value: '' } });
    expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Add a name',
    );
  });

  it('a saved key Ega cannot use asks for a name edit, and the edit fixes it', async () => {
    const { view, fields } = live([main, { ...note('confidence'), label: 'Extra' }]);
    expect(document.querySelector('[data-ega-answer-field="confidence"]')?.textContent).toContain(
      'Edit the name so Ega can read this field',
    );
    await fireEvent.click(view.getByRole('button', { name: 'Edit Extra' }));
    await fireEvent.input(view.getByLabelText('Name'), { target: { value: 'Extra' } });
    expect(fields()[1]?.key).toBe('extra');
    expect(view.container.textContent).not.toContain('Edit the name so Ega can read this field');
  });

  it('a main answer saved under a key Ega cannot use gets the answer key on a name edit', async () => {
    const { view, fields } = live([{ ...main, key: 'confidence' }, note('tone')]);
    expect(document.querySelector('[data-ega-answer-field="confidence"]')?.textContent).toContain(
      'Edit the name so Ega can read this field',
    );
    await fireEvent.click(view.getByRole('button', { name: 'Edit Answer' }));
    await fireEvent.input(view.getByLabelText('Name'), { target: { value: 'Reply' } });
    expect(fields()[0]).toMatchObject({ key: 'answer', label: 'Reply', role: 'main' });
    expect(view.container.textContent).not.toContain('Edit the name so Ega can read this field');
  });
});
