// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { resetChromeMock } from '@tests/mocks/chrome';
import CustomTaskDialog from '@/options/components/CustomTaskDialog.svelte';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { toastStore } from '@/shared/components/toastStore';
import { parseSettings } from '@/shared/settings-schema';
import { addCustomTask } from '@/shared/tasks';
import { getCustomTasks, getSettings } from '@/shared/storage';
import { TEXT_SAVE_DELAY_MS } from '@/options/components/dialog-saver.svelte';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn() }));
const confirm = vi.mocked(confirmDialog);

function open(onClose = vi.fn(), props: Record<string, unknown> = {}) {
  const onSaved = vi.fn();
  render(CustomTaskDialog, { props: { s: parseSettings({}), onClose, onSaved, ...props } });
  return { onClose, onSaved };
}

function nameInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(
    'input[data-ega-custom-task-name], [data-ega-custom-task-name] input',
  );
  if (!el) throw new Error('no name input');
  return el;
}

function field(half: 'system' | 'user'): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>(`[data-ega-template-${half}] textarea`);
  if (!el) throw new Error(`no ${half} field`);
  return el;
}

const done = (): HTMLElement => document.querySelector('[data-ega-dialog-done]') as HTMLElement;
const status = (): string =>
  document.querySelector('[data-ega-dialog-status]')?.textContent.trim() ?? '';

function radio(name: string): HTMLElement {
  const el = Array.from(document.querySelectorAll<HTMLElement>('label'))
    .find((l) => l.textContent.trim() === name)
    ?.querySelector<HTMLElement>('[role="radio"]');
  if (!el) throw new Error(`no ${name} radio`);
  return el;
}
const reply = (): HTMLElement => screen.getByRole('region', { name: 'Reply' });
const parts = (): string[] =>
  [...reply().querySelectorAll('dt')].map(
    (dt) => `${dt.textContent.trim()}: ${dt.nextElementSibling?.textContent.trim()}`,
  );

const input = {
  label: 'Polite reply',
  system: 'Turn it into a polite reply.',
  user: '{{text}}',
  output: 'plain' as const,
  pageContext: false,
  image: false,
  glossary: false,
};

beforeEach(() => {
  resetChromeMock();
  confirm.mockReset();
});

describe('a new custom task', () => {
  it("the (i) on Reply does not say the parts are fixed: here they are the user's", async () => {
    open();
    await fireEvent.click(screen.getByRole('button', { name: 'About the reply' }));
    await waitFor(() =>
      expect(document.body.textContent).toContain('Preview shows the exact text sent.'),
    );
    expect(document.body.textContent).not.toContain('You cannot change');
  });

  it('says in Reply what the answer holds, above the prompt, and keeps the exact text for Preview', async () => {
    open();
    expect(parts()).toEqual(['Answer: the main text']);
    expect(document.querySelector('[data-ega-answer-format]')).toBeNull();
    expect(reply().textContent).not.toMatch(/JSON|"answer"|key/);
    const prompt = document.querySelector('[data-ega-prompt-editor]') as HTMLElement;
    expect(reply().compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    await waitFor(() =>
      expect(document.querySelector('[data-ega-preview-format]')?.textContent).toBe(
        'Return JSON ONLY: {"answer": <your answer as a string>}.\nAnswer in English.',
      ),
    );
  });
  it('Shape and Language sit in Reply; Answer with notes lists the notes and saves', async () => {
    const row = await addCustomTask(input);
    open(vi.fn(), { row });
    expect(reply().contains(radio('Answer with notes'))).toBe(true);
    expect(reply().contains(radio('Target language'))).toBe(true);
    await fireEvent.click(radio('Answer with notes'));
    expect(parts()).toEqual([
      'Answer: the main text',
      'Notes: short notes, only when there is something to note',
    ]);
    await waitFor(async () =>
      expect((await getCustomTasks())[0]?.answer).toEqual({ v: 1, preset: 'answer-notes' }),
    );
  });
  it('saves the reply language independently without overwriting the prompt', async () => {
    const row = await addCustomTask(input);
    open(vi.fn(), { row });
    expect(document.body.textContent).not.toContain('Match the language your prompt asks for');
    const same = radio('Same as the text');
    await fireEvent.click(same);
    await waitFor(async () => expect((await getCustomTasks())[0]?.answersIn).toBe('input'));
    expect((await getCustomTasks())[0]?.system).toBe(input.system);
  });

  it('says it is not saved until it has a name, then saves itself once it does', async () => {
    open();
    expect(status()).toBe('Not saved yet: add a name');
    await fireEvent.input(nameInput(), { target: { value: 'Polite reply' } });
    await waitFor(async () => expect(await getCustomTasks()).toHaveLength(1), {
      timeout: TEXT_SAVE_DELAY_MS + 1000,
    });
    expect((await getCustomTasks())[0]?.label).toBe('Polite reply');
    await waitFor(() => expect(status()).toBe('Saved'));
  });

  it('later edits update the same row, never a second one', async () => {
    open();
    await fireEvent.input(nameInput(), { target: { value: 'Polite reply' } });
    await fireEvent.input(field('system'), { target: { value: 'Be polite.' } });
    await fireEvent.click(done());
    await waitFor(async () => expect((await getCustomTasks())[0]?.system).toBe('Be polite.'));
    expect(await getCustomTasks()).toHaveLength(1);
  });

  it('closes at once when nothing was typed', async () => {
    const { onClose } = open();
    await fireEvent.click(done());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a draft that was never saved asks Discard this task?, and keeps the draft on Keep editing', async () => {
    const { onClose } = open();
    await fireEvent.input(field('system'), { target: { value: 'Half a prompt' } });

    confirm.mockResolvedValueOnce(false);
    await fireEvent.keyDown(field('system'), { key: 'Escape' });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'Discard this task?',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    });
    // C-6: the red fill is for Delete all data only; discarding a draft is not destructive.
    expect(confirm.mock.calls[0]?.[0].danger).not.toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(field('system').value).toBe('Half a prompt');

    confirm.mockResolvedValueOnce(true);
    await fireEvent.click(done());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await getCustomTasks()).toEqual([]);
  });
});

describe('an existing custom task', () => {
  it('converts an explicit JSON format only on request, and Undo restores the original row', async () => {
    const original = {
      ...input,
      system: 'Be polite. Return JSON {"answer": string, "reason": string}.',
    };
    const row = await addCustomTask(original);
    open(vi.fn(), { row });
    expect((await getCustomTasks())[0]?.system).toBe(original.system);
    const convert = Array.from(document.querySelectorAll('button')).find(
      (el) => el.textContent.trim() === 'Turn into fields',
    );
    if (!convert) throw new Error('no conversion action');
    await fireEvent.click(convert);
    await waitFor(async () =>
      expect((await getCustomTasks())[0]?.answer).toMatchObject({
        v: 1,
        fields: [
          { key: 'answer', role: 'main' },
          { key: 'reason', role: 'notes' },
        ],
      }),
    );
    expect((await getCustomTasks())[0]?.system).toBe('Be polite.');
    const undo = document.querySelector('[data-ega-dialog-undo]') as HTMLElement;
    await waitFor(() => expect(undo).toBeTruthy());
    await fireEvent.click(undo);
    await waitFor(async () => expect((await getCustomTasks())[0]).toEqual(row));
  });
  it('holds an invalid answer field, names it on close, and clears it when choosing a preset', async () => {
    const row = await addCustomTask({
      ...input,
      answer: {
        v: 1,
        fields: [
          { key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true },
          { key: 'reason', label: 'Reason', kind: 'text', role: 'notes', required: false },
        ],
      },
    });
    open(vi.fn(), { row });
    await fireEvent.click(document.querySelector('[aria-label="Edit Reason"]') as HTMLElement);
    const fieldName = document.querySelector(
      '[data-ega-answer-field="reason"] input',
    ) as HTMLInputElement;
    await fireEvent.input(fieldName, { target: { value: '' } });
    expect(status()).toBe('Not saved');
    expect(document.querySelector('[data-ega-answer-fields-editor]')?.textContent).toContain(
      'Add a name',
    );
    confirm.mockResolvedValueOnce(false);
    await fireEvent.click(done());
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0]?.[0].body).toContain('the reply fields');
    await fireEvent.click(radio('Answer only'));
    await waitFor(async () =>
      expect((await getCustomTasks())[0]?.answer).toEqual({ v: 1, preset: 'answer-only' }),
    );
    await waitFor(() => expect(status()).toBe('Saved'));
  });
  it('Delete task removes it at once, closes, and the toast Undo brings it back exactly', async () => {
    const row = await addCustomTask(input);
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { onClose } = open(vi.fn(), { row });
    await fireEvent.click(document.querySelector('[data-ega-custom-task-delete]') as HTMLElement);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await getCustomTasks()).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    const toast = push.mock.calls[0]?.[0];
    expect(toast?.message).toBe('Deleted "Polite reply"');
    toast?.action?.onClick();
    await waitFor(async () => expect(await getCustomTasks()).toEqual([row]));
    push.mockRestore();
  });

  it('Show in right-click menu adds one item that runs the task, and off takes it away with Undo', async () => {
    const row = await addCustomTask(input);
    open(vi.fn(), { row });
    const box = document.querySelector('[data-ega-custom-task-menu]') as HTMLInputElement;
    expect(box.checked).toBe(false);
    await fireEvent.click(box);
    const runs = async (): Promise<number> =>
      (await getSettings()).contextMenuItems.filter((i) => i.kind === 'task' && i.task === row.id)
        .length;
    await waitFor(async () => expect(await runs()).toBe(1));
    await fireEvent.click(box);
    await waitFor(async () => expect(await runs()).toBe(0));
    expect(status()).toContain('Removed from the right-click menu');
    await fireEvent.click(document.querySelector('[data-ega-dialog-undo]') as HTMLElement);
    await waitFor(async () => expect(await runs()).toBe(1));
  });

  it('with a full right-click menu, Show in right-click menu stays focusable, says why, and adds nothing', async () => {
    const row = await addCustomTask(input);
    const { CONTEXT_MENU_ITEMS_MAX } = await import('@/shared/settings-schema');
    const { updateSettings } = await import('@/shared/storage');
    const cur = await getSettings();
    const full = await updateSettings({
      contextMenuItems: [
        ...cur.contextMenuItems,
        ...Array.from({ length: CONTEXT_MENU_ITEMS_MAX - cur.contextMenuItems.length }, (_, i) => ({
          id: `filler-${i}`,
          kind: 'task' as const,
          enabled: true,
          order: 100 + i,
          label: `Item ${i}`,
          task: 'summarize' as const,
          surface: 'tooltip' as const,
        })),
      ],
    });
    render(CustomTaskDialog, { props: { s: full, row, onClose: vi.fn(), onSaved: vi.fn() } });
    const box = document.querySelector('[data-ega-custom-task-menu]') as HTMLInputElement;
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(box.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain(`The right-click menu is full (${CONTEXT_MENU_ITEMS_MAX} items)`);
    await fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect((await getSettings()).contextMenuItems).toHaveLength(CONTEXT_MENU_ITEMS_MAX);
  });

  it('says so inline when another window deleted the task', async () => {
    const row = await addCustomTask(input);
    open(vi.fn(), { row });
    const { deleteCustomTaskRow } = await import('@/shared/storage');
    await deleteCustomTaskRow(row.id);
    await fireEvent.click(document.querySelector('[data-ega-custom-task-glossary]') as HTMLElement);
    await waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'This task was deleted in another window',
      ),
    );
    await waitFor(() => expect(status()).toContain('Not saved: it was deleted in another window'));
  });
});

describe('instructions that ask for their own format', () => {
  const notice = (): HTMLElement | null =>
    document.querySelector('[data-ega-template-system] [data-ega-answer-format-own]');
  const button = (name: string): HTMLElement | undefined =>
    Array.from(document.querySelectorAll<HTMLElement>('button')).find(
      (b) => b.textContent.trim() === name,
    );

  it('show one honest notice under Instructions with Turn into fields, and no Keep my instructions', async () => {
    const row = await addCustomTask({
      ...input,
      system: 'Be polite. Return JSON {"answer": string, "reason": string}.',
    });
    open(vi.fn(), { row });
    expect(notice()?.textContent.replace(/\s+/g, ' ')).toContain(
      'Your instructions ask for their own format. Ega adds its own too, so the model gets two and may mix them.',
    );
    expect(notice()?.contains(button('Turn into fields') ?? null)).toBe(true);
    expect(button('Keep my instructions')).toBeUndefined();
  });

  it('a format written in words shows the notice too, with no button', async () => {
    const row = await addCustomTask({
      ...input,
      system: 'Reply in markdown bullet points, nothing else.',
    });
    open(vi.fn(), { row });
    expect(notice()).not.toBeNull();
    expect(button('Turn into fields')).toBeUndefined();
  });

  it('a format that is all of the instructions cannot be turned into fields, and says why', async () => {
    const row = await addCustomTask({
      ...input,
      system: 'Return JSON {"answer": string, "tags": string}.',
    });
    open(vi.fn(), { row });
    expect(button('Turn into fields')).toBeUndefined();
    expect(notice()?.textContent).toContain(
      'Ega cannot take it out without leaving the instructions empty',
    );
  });

  it('Turn into fields numbers a name that repeats and saves the fields with an Undo', async () => {
    const row = await addCustomTask({
      ...input,
      system: 'Be polite. Return JSON {"answer": string, "toneA": string, "tone_a": string}.',
    });
    open(vi.fn(), { row });
    await fireEvent.click(button('Turn into fields') as HTMLElement);
    await waitFor(async () =>
      expect((await getCustomTasks())[0]?.answer).toMatchObject({
        fields: [{ label: 'Answer' }, { label: 'Tone a' }, { label: 'Tone a 2' }],
      }),
    );
    expect((await getCustomTasks())[0]?.system).toBe('Be polite.');
    expect(document.querySelector('[data-ega-answer-fields-editor]')?.textContent).not.toContain(
      'Two fields have this name',
    );
    await waitFor(() => expect(document.querySelector('[data-ega-dialog-undo]')).toBeTruthy());
  });

  it('Turn into fields leaves its notice, so focus goes to Instructions', async () => {
    const row = await addCustomTask({
      ...input,
      system: 'Rewrite it. Return JSON: {"result": <the rewrite>, "why": <one reason>}.',
    });
    open(vi.fn(), { row });
    const convert = button('Turn into fields') as HTMLElement;
    convert.focus();
    await fireEvent.click(convert);
    await waitFor(() => expect(notice()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(field('system')));
  });

  // Where the button was, so the footer keeps one row (R34, R63).
  it('Turn into fields confirms under Instructions with an Undo, not in the footer', async () => {
    const system = 'Rewrite it. Return JSON: {"result": <the rewrite>, "why": <one reason>}.';
    const row = await addCustomTask({ ...input, system });
    open(vi.fn(), { row });
    await fireEvent.click(button('Turn into fields') as HTMLElement);
    const note = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-ega-template-system] [data-ega-turned-note]',
      );
      if (!el) throw new Error('no note under Instructions');
      return el;
    });
    expect(note.querySelector('[role="status"]')?.textContent.trim()).toBe('Turned into fields');
    await waitFor(() => expect(status()).toBe('Saved'));
    const footer = document.querySelector('[data-ega-dialog-status]')?.parentElement;
    expect(footer?.querySelector('[data-ega-dialog-undo]')).toBeNull();
    await fireEvent.click(within(note).getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await getCustomTasks())[0]?.system).toBe(system));
    expect(field('system').value).toBe(system);
    expect(document.querySelector('[data-ega-turned-note]')).toBeNull();
    expect(button('Turn into fields')).toBeDefined();
  });

  it('a later edit ends the Undo, so it cannot take that edit back', async () => {
    const row = await addCustomTask({
      ...input,
      system: 'Rewrite it. Return JSON: {"result": <the rewrite>, "why": <one reason>}.',
    });
    open(vi.fn(), { row });
    await fireEvent.click(button('Turn into fields') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-ega-turned-note]')).not.toBeNull());
    await fireEvent.input(field('system'), { target: { value: 'Rewrite it kindly.' } });
    expect(document.querySelector('[data-ega-turned-note]')).toBeNull();
  });

  it('the notice stays while it is true and goes once the format is gone', async () => {
    const row = await addCustomTask({ ...input, system: 'Return JSON {"tags": "..."}. Be brief.' });
    open(vi.fn(), { row });
    expect(notice()).not.toBeNull();
    await fireEvent.input(field('system'), { target: { value: 'Be brief.' } });
    expect(notice()).toBeNull();
  });
});

describe('the footer while a reply field needs a fix', () => {
  it('a new task says only "Not saved", and Try still says what is missing', async () => {
    open();
    await fireEvent.input(nameInput(), { target: { value: 'Review' } });
    await fireEvent.click(radio('Your own fields'));
    await fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    await fireEvent.input(screen.getAllByLabelText('Name').at(-1) as HTMLElement, {
      target: { value: 'Answer' },
    });
    expect(status()).toMatch(/^Not saved( yet)?$/);
    await fireEvent.click(screen.getByRole('button', { name: 'Example reply' }));
    await fireEvent.click(screen.getByRole('button', { name: /^Try/ }));
    expect(screen.getByText('Fix the reply fields')).toBeTruthy();
  });
});

// At 320 px "Delete task" and "Not saved" pushed Done onto a second row; the footer keeps one row (R63, R16).
describe('the footer at a narrow width', () => {
  it('Delete task shows only its icon below 360 px and keeps its name', async () => {
    const row = await addCustomTask(input);
    open(vi.fn(), { row });
    const del = screen.getByRole('button', { name: 'Delete task' });
    expect(del.querySelector('.ega-btn-label')?.textContent.trim()).toBe('Delete task');
    const src = readFileSync('src/options/components/CustomTaskDialog.svelte', 'utf8');
    const narrow = /@container options \(max-width: 360px\) \{([\s\S]*?)\n {2}\}/.exec(src)?.[1];
    expect(narrow).toMatch(/\.ct-del \.ega-btn-label\) \{\s*display: none;\s*\}/);
    expect(del.classList.contains('ct-del')).toBe(true);
  });
});
