// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import Harness from '@tests/_helpers/PromptEditorHarness.svelte';
import { buildTaskTemplate, TASK_FORMATS, TRANSLATE_FORMAT } from '@/shared/task-prompts';
import { DEFAULT_PROMPT_TEMPLATE } from '@/shared/settings-schema';
import { PLAIN_CONTRACT } from '@/shared/prompts';
import type { PromptTemplate } from '@/shared/types';

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let scroll: MockInstance;
beforeEach(() => {
  scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
});
afterEach(() => scroll.mockRestore());

function setup(over: Record<string, unknown> = {}) {
  const onChange = vi.fn<(t: PromptTemplate) => void>();
  const buildPreview = vi.fn((draft: PromptTemplate, explain: boolean) => ({
    system: `SYS:${draft.system}${explain ? ':EXPLAIN' : ''}`,
    user: `USR:${draft.user}`,
  }));
  const summarize = buildTaskTemplate('summarize');
  const view = render(Harness, {
    props: {
      kind: 'task',
      task: 'summarize',
      initial: summarize,
      builtIn: summarize,
      format: TASK_FORMATS.summarize,
      snippets: {},
      sendsPageContext: false,
      buildPreview,
      onChange,
      ...over,
    },
  });
  const field = (which: 'system' | 'user'): HTMLTextAreaElement =>
    view.container.querySelector(
      `[data-ega-template-${which === 'system' ? 'system' : 'user'}] textarea`,
    ) as HTMLTextAreaElement;
  return { ...view, onChange, buildPreview, field };
}

async function openPicker(container: HTMLElement): Promise<void> {
  await fireEvent.click(container.querySelector('[data-ega-slot-insert-picker]') as HTMLElement);
  await settle();
}

describe('PromptEditor — variables', () => {
  it('a task prompt offers 8 variables, and lists the 2 it cannot fill as disabled rows with a reason', async () => {
    const { container } = setup();
    await openPicker(container);
    const rows = [...document.querySelectorAll('[data-ega-variable]')];
    const offered = rows.filter((r) => r.getAttribute('aria-disabled') !== 'true');
    const empty = rows.filter((r) => r.getAttribute('aria-disabled') === 'true');
    expect(offered).toHaveLength(8);
    expect(empty.map((r) => r.getAttribute('data-ega-variable')).sort()).toEqual([
      'detectiveInstr',
      'explainInstr',
    ]);
    expect(
      empty.find((r) => r.textContent.includes('Explain instructions'))?.textContent,
    ).toContain('Filled only for Explain');
  });

  it('the Translate prompt offers all 10, never the answer-format slot', async () => {
    const { container } = setup({
      kind: 'translate',
      task: 'translate',
      initial: DEFAULT_PROMPT_TEMPLATE,
      builtIn: DEFAULT_PROMPT_TEMPLATE,
      format: TRANSLATE_FORMAT,
    });
    await openPicker(container);
    const names = [...document.querySelectorAll('[data-ega-variable]')].map((r) =>
      r.getAttribute('data-ega-variable'),
    );
    expect(names).toHaveLength(10);
    expect(names).not.toContain('explainField');
  });

  it('each row says its plain name and meaning, and a used one says so in its name', async () => {
    const { container } = setup();
    await openPicker(container);
    const text = document.querySelector('[data-ega-variable="text"]');
    expect(text?.getAttribute('aria-label')).toBe(
      'Selected text, The text you selected; the message must contain it, inserts {{text}}, used',
    );
    const tone = document.querySelector('[data-ega-variable="tone"]');
    expect(tone?.getAttribute('aria-label')).not.toMatch(/used$/);
  });

  it('inserts at the caret of the field focused last, and Selected text always into the Message', async () => {
    const { container, field, onChange } = setup({
      initial: { system: 'Write it.', user: 'MSG' },
    });
    const sys = field('system');
    sys.focus();
    sys.setSelectionRange(5, 5);
    await openPicker(container);
    const tone = document.querySelector('[data-ega-variable="tone"]') as HTMLElement;
    await fireEvent.click(tone);
    await settle();
    await tick();
    expect(onChange).toHaveBeenLastCalledWith({ system: 'Write{{tone}} it.', user: 'MSG' });
    expect(document.activeElement).toBe(sys);
    expect(sys.selectionStart).toBe(5 + '{{tone}}'.length);

    await openPicker(container);
    await fireEvent.click(document.querySelector('[data-ega-variable="text"]') as HTMLElement);
    await settle();
    await tick();
    expect(onChange.mock.lastCall?.[0].user).toContain('{{text}}');
    expect(document.activeElement).toBe(field('user'));
  });
});

describe('PromptEditor — answer format and checks', () => {
  it('shows the task format read-only between Instructions and Message', () => {
    const { container } = setup();
    const block = container.querySelector('[data-ega-answer-format]');
    expect(block?.getAttribute('role')).toBe('group');
    expect(block?.textContent).toContain(TASK_FORMATS.summarize.text);
    expect(block?.querySelector('textarea, input')).toBeNull();
  });

  it('a prompt that holds its own format line says Ega uses it, and the button takes it out', async () => {
    const legacy = {
      system: buildTaskTemplate('summarize').system + ' ' + TASK_FORMATS.summarize.text,
      user: buildTaskTemplate('summarize').user,
    };
    const { container, getByRole, onChange } = setup({ initial: legacy });
    expect(container.querySelector('[data-ega-answer-format-own]')?.textContent).toContain(
      'Your instructions include their own answer format, so Ega uses that one.',
    );
    await fireEvent.click(getByRole('button', { name: 'Use the standard format' }));
    expect(onChange).toHaveBeenLastCalledWith(buildTaskTemplate('summarize'));
    expect(container.querySelector('[data-ega-answer-format-own]')).toBeNull();
  });

  it('a custom task shows its fixed contract and never the legacy line', () => {
    const { container } = setup({
      kind: 'custom',
      task: 'custom-1',
      builtIn: null,
      format: PLAIN_CONTRACT,
      initial: { system: 'Return JSON ONLY: my own', user: '{{text}}' },
    });
    expect(container.querySelector('[data-ega-answer-format]')?.textContent).toContain(
      PLAIN_CONTRACT,
    );
    expect(container.querySelector('[data-ega-answer-format-own]')).toBeNull();
  });

  it('a Message without the selected text shows the error under it, tied to the field', async () => {
    const { field, container } = setup();
    await fireEvent.input(field('user'), { target: { value: 'no text here' } });
    const err = container.querySelector('[data-ega-prompt-error]');
    expect(err?.textContent).toBe(
      'The message needs the Selected text variable. Add it with Insert variable.',
    );
    expect(field('user').getAttribute('aria-invalid')).toBe('true');
    expect(field('user').getAttribute('aria-describedby')).toBe(err?.id);
  });

  it('warns about an unknown name and a variable this task leaves empty', async () => {
    const { field, container } = setup();
    await fireEvent.input(field('system'), { target: { value: '{{foo}} {{explainInstr}}' } });
    const warnings = [...container.querySelectorAll('[data-ega-slot-warn]')].map((w) =>
      w.textContent.trim(),
    );
    expect(warnings).toEqual([
      '{{foo}} is not a variable, so it will be empty',
      'Explain instructions is empty for this task',
    ]);
  });

  it('marks each half that differs from the built-in as Edited', async () => {
    const { field, container } = setup();
    expect(container.querySelector('[data-ega-prompt-edited]')).toBeNull();
    await fireEvent.input(field('system'), { target: { value: 'Mine.' } });
    expect(container.querySelector('[data-ega-prompt-edited="system"]')?.textContent).toBe(
      'Edited',
    );
    expect(container.querySelector('[data-ega-prompt-edited="user"]')).toBeNull();
  });
});

describe('PromptEditor — Edit and Preview', () => {
  it('Preview is a tab: it shows the built prompt in the same place and keeps the fields mounted', async () => {
    const { container, getByRole, buildPreview } = setup();
    expect(buildPreview).not.toHaveBeenCalled();
    await fireEvent.click(getByRole('tab', { name: 'Preview' }));
    expect(getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() =>
      expect(container.querySelector('[data-ega-preview-system]')?.textContent).toContain('SYS:'),
    );
    expect(
      (
        container
          .querySelector('[data-ega-template-system]')
          ?.closest('[role="tabpanel"]') as HTMLElement
      ).hidden,
    ).toBe(true);
    expect(container.querySelector('[data-ega-slot-insert-picker]')).toBeNull();
  });

  it('arrow keys move between Edit and Preview', async () => {
    const { getByRole } = setup();
    const edit = getByRole('tab', { name: 'Edit' });
    edit.focus();
    await fireEvent.keyDown(edit, { key: 'ArrowRight' });
    await tick();
    expect(getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(getByRole('tab', { name: 'Preview' }));
  });

  it('the Translate prompt previews as Translate or Explain; a task prompt has no such choice', async () => {
    const translate = setup({
      kind: 'translate',
      task: 'translate',
      initial: DEFAULT_PROMPT_TEMPLATE,
      builtIn: DEFAULT_PROMPT_TEMPLATE,
      format: TRANSLATE_FORMAT,
    });
    await fireEvent.click(translate.getByRole('tab', { name: 'Preview' }));
    await fireEvent.click(translate.getByRole('radio', { name: 'Explain' }));
    await waitFor(() =>
      expect(translate.buildPreview).toHaveBeenLastCalledWith(DEFAULT_PROMPT_TEMPLATE, true),
    );
    translate.unmount();
    const task = setup();
    await fireEvent.click(task.getByRole('tab', { name: 'Preview' }));
    expect(task.queryByRole('radio', { name: 'Explain' })).toBeNull();
  });

  it('a build error reads as a plain line, not a stack', async () => {
    const { getByRole, container } = setup({
      buildPreview: () => {
        throw new Error('bad snippet');
      },
    });
    await fireEvent.click(getByRole('tab', { name: 'Preview' }));
    expect(container.textContent).toContain('The preview could not be built: bad snippet');
  });
});
