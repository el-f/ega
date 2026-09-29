// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import GenerationSection from '@/options/components/sections/GenerationSection.svelte';
import type { SamplingSupport } from '@/shared/backends/sampling-caps';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { makeGenerationSectionProps, sameCapsForEveryTask } from './_helpers';

const NATIVE_CAPS: SamplingSupport = {
  temperature: false,
  maxTokens: false,
  reasoningEffort: false,
};
const CLASSIC_CAPS: SamplingSupport = {
  temperature: true,
  maxTokens: true,
  reasoningEffort: false,
};
const REASONING_CAPS: SamplingSupport = {
  temperature: false,
  maxTokens: true,
  reasoningEffort: true,
};

describe('GenerationSection', () => {
  it('renders the global temperature + max-tokens sliders', () => {
    const { container } = render(GenerationSection, { props: makeGenerationSectionProps() });
    expect(container.querySelector('[data-ega-setting="advanced.temperature"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.maxTokens"]')).not.toBeNull();
  });

  it('does NOT render the defaultTone Select (TasksTonesSection owns it)', () => {
    const { container } = render(GenerationSection, { props: makeGenerationSectionProps() });
    expect(container.querySelector('[data-ega-setting="defaults.defaultTone"]')).toBeNull();
    expect(container.querySelector('#adv-tone')).toBeNull();
  });

  it('renders the per-task overrides grid (temp + max-tokens per task)', () => {
    const { container } = render(GenerationSection, { props: makeGenerationSectionProps() });
    expect(container.querySelector('[data-ega-per-task-overrides-card]')).not.toBeNull();
    expect(container.querySelector('[data-ega-pertask-row]')).not.toBeNull();
    expect(container.textContent).toMatch(/translate/i);
  });

  it('help text shows the real defaults from DEFAULT_SETTINGS, not stale literals', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({ caps: CLASSIC_CAPS }),
    });
    const tempWrap = container.querySelector('[data-ega-setting="advanced.temperature"]');
    const maxWrap = container.querySelector('[data-ega-setting="advanced.maxTokens"]');
    expect(tempWrap?.textContent).toContain(`Default ${DEFAULT_SETTINGS.advanced.temperature}`);
    expect(maxWrap?.textContent).toContain(`Default ${DEFAULT_SETTINGS.advanced.maxTokens}`);
    expect(tempWrap?.textContent).not.toContain('Default 0.3');
    expect(maxWrap?.textContent).not.toContain('Default 1024');
  });

  it('per-field reset shows in the slider head once a global value is modified', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({
        caps: CLASSIC_CAPS,
        s: { advanced: { ...DEFAULT_SETTINGS.advanced, temperature: 1 } },
      }),
    });
    const tempWrap = container.querySelector('[data-ega-setting="advanced.temperature"]');
    expect(tempWrap?.querySelector('[data-ega-reset-field]')).not.toBeNull();
    // Unmodified max-tokens stays at default → no reset.
    const maxWrap = container.querySelector('[data-ega-setting="advanced.maxTokens"]');
    expect(maxWrap?.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  it('no per-field reset at defaults (temperature 0.2 must not read as modified)', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({ caps: CLASSIC_CAPS }),
    });
    expect(container.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  describe('classic model (full caps)', () => {
    it('temperature + max-tokens enabled, effort control NOT rendered', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: CLASSIC_CAPS }),
      });
      expect(
        container.querySelector('[data-ega-setting="advanced.temperature"] .ega-slider.disabled'),
      ).toBeNull();
      expect(
        container.querySelector('[data-ega-setting="advanced.maxTokens"] .ega-slider.disabled'),
      ).toBeNull();
      expect(container.querySelector('[data-ega-setting="advanced.reasoningEffort"]')).toBeNull();
    });
  });

  describe('native backend (no caps)', () => {
    it('temperature slider disabled with the native reason text', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: NATIVE_CAPS }),
      });
      const tempWrap = container.querySelector('[data-ega-setting="advanced.temperature"]');
      expect(tempWrap?.querySelector('.ega-slider.disabled')).not.toBeNull();
      expect(tempWrap?.textContent).toMatch(/native cli manages its own sampling/i);
    });

    it('max-tokens disabled with the native note', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: NATIVE_CAPS }),
      });
      const maxWrap = container.querySelector('[data-ega-setting="advanced.maxTokens"]');
      expect(maxWrap?.querySelector('.ega-slider.disabled')).not.toBeNull();
      expect(maxWrap?.textContent).toMatch(/native cli manages its own sampling/i);
    });

    it('effort control NOT rendered', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: NATIVE_CAPS }),
      });
      expect(container.querySelector('[data-ega-setting="advanced.reasoningEffort"]')).toBeNull();
    });
  });

  describe('reasoning model (effort caps)', () => {
    it('temperature disabled with the reasoning reason text', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: REASONING_CAPS }),
      });
      const tempWrap = container.querySelector('[data-ega-setting="advanced.temperature"]');
      expect(tempWrap?.querySelector('.ega-slider.disabled')).not.toBeNull();
      expect(tempWrap?.textContent).toMatch(/reasoning models ignore temperature/i);
    });

    it('max-tokens stays enabled (reasoning still caps output)', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: REASONING_CAPS }),
      });
      expect(
        container.querySelector('[data-ega-setting="advanced.maxTokens"] .ega-slider.disabled'),
      ).toBeNull();
    });

    it('renders the segmented low/medium/high effort control', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: REASONING_CAPS }),
      });
      const effort = container.querySelector('[data-ega-setting="advanced.reasoningEffort"]');
      expect(effort).not.toBeNull();
      expect(effort?.querySelector('[data-ega-effort-value="low"]')).not.toBeNull();
      expect(effort?.querySelector('[data-ega-effort-value="medium"]')).not.toBeNull();
      expect(effort?.querySelector('[data-ega-effort-value="high"]')).not.toBeNull();
      expect(
        effort?.querySelector('[role="radiogroup"][aria-label="Reasoning effort"]'),
      ).not.toBeNull();
    });

    it('selecting an effort writes s.advanced.reasoningEffort', async () => {
      const onSetGlobalReasoningEffort = (await import('vitest')).vi.fn();
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: REASONING_CAPS, onSetGlobalReasoningEffort }),
      });
      const high = container.querySelector('[data-ega-effort-value="high"]') as HTMLElement;
      await fireEvent.click(high);
      expect(onSetGlobalReasoningEffort).toHaveBeenCalledWith('high');
    });

    it('renders a per-task effort column and writes via onSetTaskReasoningEffort', async () => {
      const onSetTaskReasoningEffort = (await import('vitest')).vi.fn();
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: REASONING_CAPS, onSetTaskReasoningEffort }),
      });
      const cell = container.querySelector(
        '[data-ega-pertask-effort="translate"] [data-ega-effort-value="high"]',
      ) as HTMLElement;
      expect(cell).not.toBeNull();
      await fireEvent.click(cell);
      expect(onSetTaskReasoningEffort).toHaveBeenCalledWith('translate', 'high');
    });
  });

  describe('per-task rows follow their own task head, not the translate head', () => {
    it('a task pinned to native gets disabled inputs while a cloud task stays editable', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({
          caps: CLASSIC_CAPS,
          taskCaps: { ...sameCapsForEveryTask(CLASSIC_CAPS), reword: NATIVE_CAPS },
        }),
      });
      const temp = (task: string) =>
        container.querySelector<HTMLInputElement>(`[data-ega-pertask-temp="${task}"]`);
      const max = (task: string) =>
        container.querySelector<HTMLInputElement>(`[data-ega-pertask-max="${task}"]`);
      expect(temp('reword')?.disabled).toBe(true);
      expect(max('reword')?.disabled).toBe(true);
      expect(temp('ask')?.disabled).toBe(false);
      expect(max('ask')?.disabled).toBe(false);
    });

    it('shows the effort column when any task head supports it, with an empty cell elsewhere', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({
          caps: CLASSIC_CAPS,
          taskCaps: { ...sameCapsForEveryTask(CLASSIC_CAPS), ask: REASONING_CAPS },
        }),
      });
      expect(container.querySelector('.overrides-grid.with-effort')).not.toBeNull();
      expect(container.textContent).toMatch(/effort/i);
      expect(
        container.querySelector('[data-ega-pertask-effort="ask"] [data-ega-effort-value="high"]'),
      ).not.toBeNull();
      const translateCell = container.querySelector('[data-ega-pertask-effort="translate"]');
      expect(translateCell).not.toBeNull();
      expect(translateCell?.querySelector('[data-ega-effort-value]')).toBeNull();
      // The global control still follows the translate head.
      expect(container.querySelector('[data-ega-setting="advanced.reasoningEffort"]')).toBeNull();
    });
  });

  describe('edits reach the setters', () => {
    it('a per-task temperature is clamped to 0..2 and an empty field clears it', async () => {
      const props = makeGenerationSectionProps();
      const { getByLabelText } = render(GenerationSection, { props });
      const input = getByLabelText('Temperature override for Translate');
      for (const value of ['0.7', '5', '-1', '']) {
        await fireEvent.change(input, { target: { value } });
      }
      expect(props.onSetTaskTemperature.mock.calls).toEqual([
        ['translate', 0.7],
        ['translate', 2],
        ['translate', 0],
        ['translate', null],
      ]);
    });

    it('a per-task max tokens is floored, clamped to 16..8192, and an empty field clears it', async () => {
      const props = makeGenerationSectionProps();
      const { getByLabelText } = render(GenerationSection, { props });
      const input = getByLabelText('Max tokens override for Explain');
      for (const value of ['100.9', '1', '99999', '']) {
        await fireEvent.change(input, { target: { value } });
      }
      expect(props.onSetTaskMaxTokens.mock.calls).toEqual([
        ['explain', 100],
        ['explain', 16],
        ['explain', 8192],
        ['explain', null],
      ]);
    });

    it('a per-task clear button sends null for its own task and field only', async () => {
      const props = makeGenerationSectionProps({
        s: { taskTemperatures: { explain: 0.5 }, taskMaxTokens: { explain: 300 } },
      });
      const { getByRole } = render(GenerationSection, { props });
      await fireEvent.click(
        getByRole('button', { name: 'Clear temperature override for Explain' }),
      );
      await fireEvent.click(getByRole('button', { name: 'Clear max tokens override for Explain' }));
      expect(props.onSetTaskTemperature.mock.calls).toEqual([['explain', null]]);
      expect(props.onSetTaskMaxTokens.mock.calls).toEqual([['explain', null]]);
    });

    it('Reset section puts both global values back to their defaults', async () => {
      const props = makeGenerationSectionProps({
        s: { advanced: { ...DEFAULT_SETTINGS.advanced, temperature: 1.1, maxTokens: 900 } },
      });
      const { getByRole } = render(GenerationSection, { props });
      await fireEvent.click(getByRole('button', { name: 'Reset Generation section to defaults' }));
      await waitFor(() =>
        expect(props.onSetGlobalMaxTokens).toHaveBeenCalledWith(
          DEFAULT_SETTINGS.advanced.maxTokens,
        ),
      );
      expect(props.onSetGlobalTemperature).toHaveBeenCalledWith(
        DEFAULT_SETTINGS.advanced.temperature,
      );
    });

    it('Clear every per-task override sends null only for the overrides that exist', async () => {
      const props = makeGenerationSectionProps({
        caps: REASONING_CAPS,
        taskCaps: sameCapsForEveryTask(REASONING_CAPS),
        s: {
          taskTemperatures: { translate: 0.4 },
          taskMaxTokens: { explain: 200 },
          taskReasoningEfforts: { reword: 'high' },
        },
      });
      const { getByRole } = render(GenerationSection, { props });
      await fireEvent.click(getByRole('button', { name: 'Clear every per-task override' }));
      await waitFor(() =>
        expect(props.onSetTaskReasoningEffort.mock.calls).toEqual([['reword', null]]),
      );
      expect(props.onSetTaskTemperature.mock.calls).toEqual([['translate', null]]);
      expect(props.onSetTaskMaxTokens.mock.calls).toEqual([['explain', null]]);
    });

    it('picking an effort sends it to the global or the per-task setter', async () => {
      const props = makeGenerationSectionProps({
        caps: REASONING_CAPS,
        taskCaps: sameCapsForEveryTask(REASONING_CAPS),
        s: { advanced: { ...DEFAULT_SETTINGS.advanced, reasoningEffort: 'low' } },
      });
      const { getByRole } = render(GenerationSection, { props });
      const global = getByRole('radiogroup', { name: 'Reasoning effort' });
      await fireEvent.click(within(global).getByRole('radio', { name: 'High' }));
      const perTask = getByRole('radiogroup', { name: 'Reasoning effort override for Reword' });
      await fireEvent.click(within(perTask).getByRole('radio', { name: 'Medium' }));
      expect(props.onSetGlobalReasoningEffort).toHaveBeenCalledWith('high');
      expect(props.onSetTaskReasoningEffort).toHaveBeenCalledWith('reword', 'medium');
    });
  });
});
