// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '@tests/mocks/chrome';
import TaskEditDialog from '@/options/components/TaskEditDialog.svelte';
import { getSettings, updateSettings } from '@/shared/storage';
import { buildTaskTemplate } from '@/shared/task-prompts';
import { DEFAULT_PROMPT_TEMPLATE } from '@/shared/settings-schema';
import type { Task } from '@/shared/task-prompts';

// Storage is real: these pin which setting each Save and Reset writes, not just that a handler ran.

async function open(task: Task): Promise<void> {
  render(TaskEditDialog, {
    props: { s: await getSettings(), task, onClose: vi.fn(), onSaved: vi.fn() },
  });
}

function field(half: 'system' | 'user'): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>(`[data-ega-template-${half}] textarea`);
  if (!el) throw new Error(`no ${half} editor`);
  return el;
}

function click(selector: string): Promise<boolean> {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`no ${selector}`);
  return fireEvent.click(el);
}

beforeEach(() => {
  resetChromeMock();
});

describe('the prompt editor inside a task dialog', () => {
  it('Save on Reword writes the Reword edit and leaves the Translate prompt alone', async () => {
    await open('reword');
    await fireEvent.input(field('user'), { target: { value: 'Make it formal: {{text}}' } });
    await click('[data-ega-template-save]');

    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.reword?.user).toBe('Make it formal: {{text}}'),
    );
    expect((await getSettings()).advanced.promptTemplate).toEqual(DEFAULT_PROMPT_TEMPLATE);
  });

  it("Summarize's per-field reset goes back to the Summarize prompt, never the Translate one", async () => {
    await updateSettings({
      taskOverrides: { summarize: { system: 'My system.', user: 'My user {{text}}' } },
    });
    await open('summarize');
    await click('[data-ega-reset-field][aria-label^="Reset instructions"]');

    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize).toEqual({ user: 'My user {{text}}' }),
    );
    expect(field('system').value).toBe(buildTaskTemplate('summarize').system);
    expect(field('system').value).not.toBe(DEFAULT_PROMPT_TEMPLATE.system);
  });

  it('Save on Translate writes the global prompt that Explain and the languages share', async () => {
    await open('translate');
    await fireEvent.input(field('system'), { target: { value: 'My translate system.' } });
    await click('[data-ega-template-save]');

    await waitFor(async () =>
      expect((await getSettings()).advanced.promptTemplate.system).toBe('My translate system.'),
    );
    expect((await getSettings()).taskOverrides).toEqual({});
  });
});

describe('the task Effort select', () => {
  const firstOption = (): string =>
    document.querySelector('[data-ega-task-effort] select option')?.textContent.trim() ?? '';

  it('names the level a task runs at with no edit: its own default, else the global Effort', async () => {
    await open('explain');
    expect(firstOption()).toBe('Default (Low)');
    document.body.innerHTML = '';
    await open('summarize');
    expect(firstOption()).toBe('Default (Off)');
  });

  it('a global Effort above the shipped Low raises the default too', async () => {
    const s = await getSettings();
    await updateSettings({ advanced: { ...s.advanced, effort: 'high' } });
    await open('explain');
    expect(firstOption()).toBe('Default (High)');
  });
});
