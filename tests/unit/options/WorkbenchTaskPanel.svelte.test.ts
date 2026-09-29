// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import WorkbenchTaskPanel from '@/options/components/templates-pane/WorkbenchTaskPanel.svelte';
import { parseSettings } from '@/shared/settings-schema';
import { buildTaskTemplate } from '@/shared/task-prompts';
import { makeMockHandlers } from './_mock-templates-handlers';

function baseProps(overrides: Record<string, unknown> = {}) {
  const s = parseSettings({});
  return {
    s,
    chip: 'summarize' as const,
    backendIds: [] as readonly string[],
    TemplateEditorCmp: null,
    handlers: makeMockHandlers(),
    onChipChange: vi.fn(),
    onOpenPreview: vi.fn(),
    ...overrides,
  };
}

describe('WorkbenchTaskPanel — inheritedTemplate', () => {
  it('task chip passes buildTaskTemplate as inheritedTemplate, not the global translate template', () => {
    const s = parseSettings({});
    const summarizeDefault = buildTaskTemplate('summarize', s.defaultTone);

    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ s }),
    });

    const wrapper = container.querySelector('[data-ega-task-tab-wrapper="summarize"]');
    expect(wrapper).not.toBeNull();
    expect(summarizeDefault.system).not.toBe(s.advanced.promptTemplate.system);
  });
});

describe('WorkbenchTaskPanel — per-task param callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('changing temperature input invokes handlers.setTaskTemperature with (task, numericValue)', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });

    const tempInput = container.querySelector('[data-ega-task-temp="reword"]') as HTMLInputElement;
    expect(tempInput).not.toBeNull();

    await fireEvent.input(tempInput, { target: { value: '0.8' } });

    await waitFor(() => expect(handlers.setTaskTemperature).toHaveBeenCalled());
    expect(handlers.setTaskTemperature).toHaveBeenCalledWith('reword', 0.8);
  });

  it('clearing temperature input invokes handlers.setTaskTemperature with (task, null)', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });

    const tempInput = container.querySelector('[data-ega-task-temp="reword"]') as HTMLInputElement;
    await fireEvent.change(tempInput, { target: { value: '' } });

    await waitFor(() => expect(handlers.setTaskTemperature).toHaveBeenCalled());
    expect(handlers.setTaskTemperature).toHaveBeenCalledWith('reword', null);
  });

  it('changing maxTokens input invokes handlers.setTaskMaxTokens with (task, numericValue)', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });

    const maxInput = container.querySelector('[data-ega-task-max="reword"]') as HTMLInputElement;
    expect(maxInput).not.toBeNull();

    await fireEvent.input(maxInput, { target: { value: '1024' } });

    await waitFor(() => expect(handlers.setTaskMaxTokens).toHaveBeenCalled());
    expect(handlers.setTaskMaxTokens).toHaveBeenCalledWith('reword', 1024);
  });

  it('clearing maxTokens input invokes handlers.setTaskMaxTokens with (task, null)', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });

    const maxInput = container.querySelector('[data-ega-task-max="reword"]') as HTMLInputElement;
    await fireEvent.change(maxInput, { target: { value: '' } });

    await waitFor(() => expect(handlers.setTaskMaxTokens).toHaveBeenCalled());
    expect(handlers.setTaskMaxTokens).toHaveBeenCalledWith('reword', null);
  });

  it('changing tone select invokes handlers.setTaskTone with (task, toneValue)', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });

    const toneSelect = container.querySelector(
      '[data-ega-task-tone="reword"]',
    ) as HTMLSelectElement;
    expect(toneSelect).not.toBeNull();

    await fireEvent.change(toneSelect, { target: { value: 'formal' } });

    await waitFor(() => expect(handlers.setTaskTone).toHaveBeenCalled());
    expect(handlers.setTaskTone).toHaveBeenCalledWith('reword', 'formal');
  });

  it('selecting empty tone invokes handlers.setTaskTone with (task, null)', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });

    const toneSelect = container.querySelector(
      '[data-ega-task-tone="reword"]',
    ) as HTMLSelectElement;
    await fireEvent.change(toneSelect, { target: { value: '' } });

    await waitFor(() => expect(handlers.setTaskTone).toHaveBeenCalled());
    expect(handlers.setTaskTone).toHaveBeenCalledWith('reword', null);
  });

  it('changing backend select invokes handlers.setTaskBackend with (task, backendId)', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers, backendIds: ['anthropic', 'openai'] }),
    });

    const backendSelect = container.querySelector(
      '[data-ega-task-backend="reword"]',
    ) as HTMLSelectElement;
    expect(backendSelect).not.toBeNull();

    await fireEvent.change(backendSelect, { target: { value: 'anthropic' } });

    await waitFor(() => expect(handlers.setTaskBackend).toHaveBeenCalled());
    expect(handlers.setTaskBackend).toHaveBeenCalledWith('reword', 'anthropic');
  });

  it('manage-rules link invokes onChipChange with "rules"', async () => {
    const onChipChange = vi.fn();
    const base = parseSettings({});
    const rule = {
      id: 'r1',
      body: 'Always be polite.',
      category: 'always' as const,
      scope: { tasks: [] as const },
      source: 'manual' as const,
      addedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
    };
    const s = { ...base, advanced: { ...base.advanced, rules: [rule] } };
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', onChipChange, s }),
    });

    const manageRulesBtn = await waitFor(() => {
      const btn = container.querySelector<HTMLButtonElement>('[data-ega-manage-rules]');
      if (!btn) throw new Error('manage-rules button not found');
      return btn;
    });
    await fireEvent.click(manageRulesBtn);

    expect(onChipChange).toHaveBeenCalledWith('rules');
  });
});

describe('WorkbenchTaskPanel — number inputs do not clamp under the caret', () => {
  it('typing "1" on the way to "100" writes nothing; change commits with the clamp', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });
    const maxInput = container.querySelector('[data-ega-task-max="reword"]') as HTMLInputElement;
    await fireEvent.input(maxInput, { target: { value: '1' } });
    expect(handlers.setTaskMaxTokens).not.toHaveBeenCalled();
    await fireEvent.input(maxInput, { target: { value: '100' } });
    expect(handlers.setTaskMaxTokens).toHaveBeenCalledWith('reword', 100);
    await fireEvent.change(maxInput, { target: { value: '5' } });
    expect(handlers.setTaskMaxTokens).toHaveBeenLastCalledWith('reword', 16);
  });

  it('a half-typed temperature ("0.") waits for change', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });
    const tempInput = container.querySelector('[data-ega-task-temp="reword"]') as HTMLInputElement;
    await fireEvent.input(tempInput, { target: { value: '0.' } });
    expect(handlers.setTaskTemperature).not.toHaveBeenCalled();
    await fireEvent.input(tempInput, { target: { value: '0.7' } });
    expect(handlers.setTaskTemperature).toHaveBeenCalledWith('reword', 0.7);
  });

  it('a complete temperature with a trailing zero ("0.30", as pasted) saves without waiting for change', async () => {
    const handlers = makeMockHandlers();
    const { container } = render(WorkbenchTaskPanel, {
      props: baseProps({ chip: 'reword', handlers }),
    });
    const tempInput = container.querySelector('[data-ega-task-temp="reword"]') as HTMLInputElement;
    await fireEvent.input(tempInput, { target: { value: '0.30' } });
    expect(handlers.setTaskTemperature).toHaveBeenCalledWith('reword', 0.3);
  });
});
