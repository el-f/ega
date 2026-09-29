// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import TemplateEditor from '@/options/components/TemplateEditor.svelte';
import { parseSettings } from '@/shared/settings-schema';

function baseProps(overrides: Record<string, unknown> = {}) {
  const template = { system: 'You translate.', user: 'Translate: {{text}}' };
  return {
    scope: { scope: 'global' as const },
    task: 'translate' as const,
    template,
    inheritedTemplate: template,
    snippets: {} as Record<string, string>,
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
  it('global scope hides the inline compiled-preview disclosure', () => {
    const { container } = render(TemplateEditor, { props: baseProps() });
    expect(container.querySelector('[data-ega-compile-preview]')).toBeNull();
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
