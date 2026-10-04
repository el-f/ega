// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import TemplateEditor from '@/options/components/TemplateEditor.svelte';
import { parseSettings } from '@/shared/settings-schema';
import { DEFAULT_TEMPLATE } from '@/shared/prompts';

function baseProps(overrides: Record<string, unknown> = {}) {
  const template = { system: 'You translate.', user: 'Translate: {{text}}' };
  return {
    scope: { scope: 'global' as const },
    inheritedLabel: 'Use built-in',
    task: 'translate' as const,
    template,
    inheritedTemplate: template,
    settings: parseSettings({}),
    onSave: vi.fn().mockResolvedValue(undefined),
    onReset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function userTextarea(container: HTMLElement): HTMLTextAreaElement {
  const el = container.querySelector<HTMLTextAreaElement>('[data-ega-template-user] textarea');
  if (!el) throw new Error('expected user template textarea');
  return el;
}

function saveButton(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>('[data-ega-template-save]');
  if (!el) throw new Error('expected save button');
  return el;
}

describe('TemplateEditor — saved status', () => {
  it('shows "Saved" after save, then clears it as soon as the draft diverges', async () => {
    const { container } = render(TemplateEditor, { props: baseProps() });

    await fireEvent.input(userTextarea(container), {
      target: { value: 'Edited: {{text}}' },
    });
    await fireEvent.click(saveButton(container));

    await waitFor(() => {
      expect(container.querySelector('[role="status"]')?.textContent).toContain('Saved');
    });

    await fireEvent.input(userTextarea(container), {
      target: { value: 'Edited again: {{text}}' },
    });
    await waitFor(() => {
      expect(container.querySelector('[role="status"]')).toBeNull();
    });
  });
});

describe('TemplateEditor — blocked save', () => {
  it('renders ONE error message that explains {{text}} and the Insert variable path', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(TemplateEditor, { props: baseProps({ onSave }) });

    await fireEvent.input(userTextarea(container), {
      target: { value: 'no required slot here' },
    });
    await fireEvent.click(saveButton(container));

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(1);
    expect(alerts[0]?.textContent).toMatch(/must include \{\{text\}\}/);
    expect(alerts[0]?.textContent).toMatch(/Insert variable/);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('TemplateEditor — preview surfaces', () => {
  it('global scope shows the inline compiled preview too', () => {
    const { container } = render(TemplateEditor, { props: baseProps() });
    expect(container.querySelector('[data-ega-compile-preview]')).not.toBeNull();
  });

  it('task scope keeps the inline compiled-preview disclosure', () => {
    const { container } = render(TemplateEditor, {
      props: baseProps({
        scope: { scope: 'task', task: 'summarize' },
        task: 'summarize' as const,
      }),
    });
    expect(container.querySelector('[data-ega-compile-preview]')).not.toBeNull();
  });
});

describe('TemplateEditor — the compiled preview follows the scope', () => {
  const tpl = {
    system: '{{langLabel}}|{{langHint}}|{{detectiveInstr}}',
    user: 'Translate: {{text}}',
  };

  async function previewSystem(scope: Record<string, unknown>): Promise<string> {
    const { container } = render(TemplateEditor, {
      props: baseProps({ scope, template: tpl, inheritedTemplate: tpl }),
    });
    let text = '';
    await waitFor(() => {
      text = container.querySelector('[data-ega-preview-system]')?.textContent ?? '';
      expect(text).not.toBe('');
    });
    return text;
  }

  it('a per-preset scope previews that preset, not the auto branch', async () => {
    const text = await previewSystem({ scope: 'preset', presetId: 'arabizi' });
    expect(text).toContain('Arabizi');
    expect(text).toContain('Confirm the variety');
    expect(text).not.toContain('CANDIDATES');
  });

  it('a per-task scope stays on auto and offers the candidate list', async () => {
    const text = await previewSystem({ scope: 'task', task: 'translate' });
    expect(text).toContain('CANDIDATES');
    expect(text).not.toContain('Confirm the variety');
  });
});

describe('TemplateEditor — the compiled preview resolves snippets once', () => {
  it('keeps an escaped @@name@@ literal, as the router sends it', async () => {
    const settings = parseSettings({
      advanced: { snippets: { lead: 'Lead \\@@kept@@.', kept: 'resolved twice' } },
    });
    const tpl = { system: '@@lead@@', user: '{{text}}' };
    const { container } = render(TemplateEditor, {
      props: baseProps({
        scope: { scope: 'task', task: 'summarize' },
        task: 'summarize',
        template: tpl,
        inheritedTemplate: tpl,
        settings,
      }),
    });
    let text = '';
    await waitFor(() => {
      text = container.querySelector('[data-ega-preview-system]')?.textContent ?? '';
      expect(text).not.toBe('');
    });
    expect(text).toContain('Lead @@kept@@.');
    expect(text).not.toContain('resolved twice');
  });
});

describe('TemplateEditor — the compiled preview carries what the router adds', () => {
  it('shows the glossary and the task rules for a task that takes the glossary', async () => {
    const settings = parseSettings({
      glossary: [{ term: 'Hello', translation: 'Hola', caseSensitive: false }],
      taskOverrides: { summarize: { glossary: true } },
      advanced: {
        rules: [
          {
            id: 'r1',
            body: 'Keep it short.',
            category: 'always',
            scope: { tasks: ['summarize'] },
            source: 'manual',
            addedAt: '2026-01-01T00:00:00.000Z',
            enabled: true,
          },
        ],
      },
    });
    const tpl = { system: 'Summarize.', user: '{{text}}' };
    const { container } = render(TemplateEditor, {
      props: baseProps({
        scope: { scope: 'task', task: 'summarize' },
        task: 'summarize',
        template: tpl,
        inheritedTemplate: tpl,
        settings,
      }),
    });
    let text = '';
    await waitFor(() => {
      text = container.querySelector('[data-ega-preview-system]')?.textContent ?? '';
      expect(text).toContain('Summarize.');
    });
    expect(text).toContain('"Hello" → "Hola"');
    expect(text).toContain('Keep it short.');
  });
});

describe('TemplateEditor — warnings', () => {
  const BIG = 'x'.repeat(8192);
  const withSnippets = (snippets: Record<string, string>) => {
    const s = parseSettings({});
    return { ...s, advanced: { ...s.advanced, snippets } };
  };

  it('flags the prompt that is past the cap with its kept snippets written out', () => {
    const template = { system: '@@big@@@@big@@', user: '{{text}}' };
    const { container } = render(TemplateEditor, {
      props: baseProps({
        template,
        inheritedTemplate: template,
        settings: withSnippets({ big: BIG }),
      }),
    });
    const text = container.querySelector('[data-ega-snippet-warn]')?.textContent ?? '';
    expect(text.replace(/\s+/g, ' ')).toContain('longer than 16,000 characters');
  });

  it('says nothing for a prompt that fits, or when no snippets are kept', () => {
    const fits = { system: '@@big@@', user: '{{text}}' };
    const a = render(TemplateEditor, {
      props: baseProps({
        template: fits,
        inheritedTemplate: fits,
        settings: withSnippets({ big: BIG }),
      }),
    });
    expect(a.container.querySelector('[data-ega-snippet-warn]')).toBeNull();
    const long = { system: '@@big@@@@big@@', user: '{{text}}' };
    const b = render(TemplateEditor, {
      props: baseProps({ template: long, inheritedTemplate: long, settings: withSnippets({}) }),
    });
    expect(b.container.querySelector('[data-ega-snippet-warn]')).toBeNull();
  });

  it('warns that an unknown variable will be empty', async () => {
    const { container } = render(TemplateEditor, { props: baseProps() });
    await fireEvent.input(userTextarea(container), { target: { value: 'Hi {{nope}} {{text}}' } });
    await waitFor(() => {
      expect(container.querySelector('[data-ega-slot-warn]')?.textContent).toBe(
        'Unknown variable {{nope}}. It will be empty.',
      );
    });
  });
});

describe('TemplateEditor — the shipped prompt', () => {
  it('shows no variable warning: its explain slots are filled when it serves Explain', () => {
    const template = { ...DEFAULT_TEMPLATE };
    const { container } = render(TemplateEditor, {
      props: baseProps({ template, inheritedTemplate: template }),
    });
    expect(DEFAULT_TEMPLATE.system).toContain('{{explainInstr}}');
    expect(container.querySelector('[data-ega-slot-warn]')).toBeNull();
  });
});
