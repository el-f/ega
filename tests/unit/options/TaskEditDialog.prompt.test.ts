// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '@tests/mocks/chrome';
import TaskEditDialog from '@/options/components/TaskEditDialog.svelte';
import { getSettings, updateSettings } from '@/shared/storage';
import { buildTaskTemplate } from '@/shared/task-template';
import { TASK_FORMATS } from '@/shared/answer/formats-v1';
import { DEFAULT_PROMPT_TEMPLATE } from '@/shared/settings-schema';
import { TEXT_SAVE_DELAY_MS } from '@/options/components/dialog-saver.svelte';
import type { Task } from '@/shared/task-prompts';
import type { Settings } from '@/shared/types';

// Storage is real: these pin which setting each edit writes, not just that a handler ran.

async function open(task: Task, onClose = vi.fn()): Promise<{ onSaved: ReturnType<typeof vi.fn> }> {
  const onSaved = vi.fn<(s: Settings) => void>();
  render(TaskEditDialog, { props: { s: await getSettings(), task, onClose, onSaved } });
  return { onSaved };
}

function field(half: 'system' | 'user'): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>(`[data-ega-template-${half}] textarea`);
  if (!el) throw new Error(`no ${half} editor`);
  return el;
}

function el(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`no ${selector}`);
  return found;
}

const status = (): string => el('[data-ega-dialog-status]').textContent.trim();

beforeEach(() => {
  resetChromeMock();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the prompt inside a task dialog saves as you type', () => {
  it('an edit to Reword saves the Reword edit after the pause and leaves the Translate prompt alone', async () => {
    await open('reword');
    await fireEvent.input(field('user'), { target: { value: 'Make it formal: {{text}}' } });
    await waitFor(
      async () =>
        expect((await getSettings()).taskOverrides.reword?.user).toBe('Make it formal: {{text}}'),
      { timeout: TEXT_SAVE_DELAY_MS + 1000 },
    );
    expect((await getSettings()).advanced.promptTemplate).toEqual(DEFAULT_PROMPT_TEMPLATE);
    await waitFor(() => expect(status()).toBe('Saved'));
  });

  it('an edit to Translate writes the prompt that Explain and the languages share', async () => {
    await open('translate');
    await fireEvent.input(field('system'), { target: { value: 'My translate system.' } });
    await waitFor(
      async () =>
        expect((await getSettings()).advanced.promptTemplate.system).toBe('My translate system.'),
      { timeout: TEXT_SAVE_DELAY_MS + 1000 },
    );
    expect((await getSettings()).taskOverrides).toEqual({});
  });

  it('typing then Done within the pause still saves (Done flushes the waiting edit)', async () => {
    const onClose = vi.fn();
    await open('summarize', onClose);
    await fireEvent.input(field('system'), { target: { value: 'Short.' } });
    await fireEvent.click(el('[data-ega-dialog-done]'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect((await getSettings()).taskOverrides.summarize?.system).toBe('Short.');
  });

  it('a Message without the selected text is not saved, while Effort still is', async () => {
    await open('summarize');
    await fireEvent.input(field('user'), { target: { value: 'no text' } });
    expect(status()).toBe('Not saved: the message needs the Selected text variable');
    await fireEvent.click(el('[data-ega-task-effort] [data-ega-effort-value="high"]'));
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize?.effort).toBe('high'),
    );
    // The Effort write flushes every waiting text write first, so a saved Message would be stored by now.
    expect((await getSettings()).taskOverrides.summarize?.user).toBeUndefined();
  });

  it('Reset puts every field back to built-in, and Undo in the status line restores each one', async () => {
    await updateSettings({
      taskOverrides: {
        summarize: { system: 'My system.', user: 'My user {{text}}', effort: 'high' },
      },
    });
    await open('summarize');
    await fireEvent.click(el('[data-ega-section-reset]'));
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize).toBeUndefined(),
    );
    expect(field('system').value).toBe(buildTaskTemplate('summarize').system);
    expect(status()).toContain('Back to built-in');
    expect(document.activeElement).toBe(el('[data-ega-dialog-undo]'));

    await fireEvent.click(el('[data-ega-dialog-undo]'));
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize).toEqual({
        system: 'My system.',
        user: 'My user {{text}}',
        effort: 'high',
      }),
    );
    expect(field('system').value).toBe('My system.');
    expect(status()).toBe('Your edits are back');
  });

  it('a stored prompt with its own format line shows it is kept, and nothing is rewritten on open', async () => {
    // Edited before the format left the editable text: the user's own words, then the old format line.
    const legacy = 'Summarize in one line. ' + TASK_FORMATS.summarize.text;
    await updateSettings({ taskOverrides: { summarize: { system: legacy } } });
    const onClose = vi.fn();
    await open('summarize', onClose);
    expect(document.querySelector('[data-ega-answer-format-own]')).not.toBeNull();
    // Done saves every waiting edit before it closes, so a rewrite on open would be stored by now.
    await fireEvent.click(el('[data-ega-dialog-done]'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect((await getSettings()).taskOverrides.summarize?.system).toBe(legacy);
  });
});

describe('the task Effort control', () => {
  const hint = (): string => el('[data-ega-task-effort] [data-ega-hint]').textContent.trim();

  it('names the level a task runs at with no edit: its own default, else the global Effort', async () => {
    await open('explain');
    expect(hint()).toBe('Default for this task is Low');
    document.body.innerHTML = '';
    await open('summarize');
    expect(hint()).toBe('Default for this task is Off');
  });

  it('a global Effort above the shipped Low raises the default too', async () => {
    const s = await getSettings();
    await updateSettings({ advanced: { ...s.advanced, effort: 'high' } });
    await open('explain');
    expect(hint()).toBe('Default for this task is High');
  });

  it('Default removes the task Effort and keeps the other fields', async () => {
    await updateSettings({ taskOverrides: { reword: { effort: 'high', glossary: true } } });
    await open('reword');
    await fireEvent.click(el('[data-ega-task-effort] [data-ega-effort-value=""]'));
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.reword).toEqual({ glossary: true }),
    );
  });
});

describe('Explain', () => {
  it('has no prompt of its own and offers the Translate prompt instead', async () => {
    const onSwitchTask = vi.fn();
    render(TaskEditDialog, {
      props: {
        s: await getSettings(),
        task: 'explain',
        onClose: vi.fn(),
        onSaved: vi.fn(),
        onSwitchTask,
      },
    });
    expect(document.querySelector('[data-ega-template-system]')).toBeNull();
    expect(el('[data-ega-task-prompt-note]').textContent).toContain(
      'Explain uses the Translate prompt and adds its own instructions',
    );
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Edit the Translate prompt',
    );
    await fireEvent.click(btn as HTMLElement);
    expect(onSwitchTask).toHaveBeenCalledWith('translate');
  });
});
