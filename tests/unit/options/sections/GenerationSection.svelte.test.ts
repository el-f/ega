// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import GenerationSection from '@/options/components/sections/GenerationSection.svelte';
import type { SamplingSupport } from '@/shared/backends/sampling-caps';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { makeGenerationSectionProps } from './_helpers';

const NATIVE_CAPS: SamplingSupport = { temperature: false, maxTokens: false, efforts: [] };
const CLASSIC_CAPS: SamplingSupport = { temperature: true, maxTokens: true, efforts: [] };
const REASONING_CAPS: SamplingSupport = {
  temperature: false,
  maxTokens: true,
  efforts: ['low', 'medium', 'high'],
};
const OFF_CAPS: SamplingSupport = {
  temperature: false,
  maxTokens: true,
  efforts: ['off', 'low', 'medium', 'high'],
};

const note = (c: HTMLElement): string =>
  c.querySelector('[data-ega-effort-note]')?.textContent.trim() ?? '';

describe('GenerationSection', () => {
  it('renders Effort, max answer length and, where the model takes it, temperature', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({ caps: CLASSIC_CAPS }),
    });
    expect(container.querySelector('[data-ega-setting="advanced.effort"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.maxTokens"]')).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="advanced.temperature"] .ega-slider'),
    ).not.toBeNull();
  });

  it.each([
    ['advanced.maxTokens', 'onSetGlobalMaxTokens'],
    ['advanced.temperature', 'onSetGlobalTemperature'],
  ] as const)('a %s drag writes nothing until the thumb is released', async (setting, setter) => {
    const props = makeGenerationSectionProps({ caps: CLASSIC_CAPS });
    const { container } = render(GenerationSection, { props });
    const root = container.querySelector<HTMLElement>(
      `[data-ega-setting="${setting}"] [data-slider-root]`,
    );
    if (!root) throw new Error('no slider');
    await fireEvent.pointerDown(root, { clientX: 50, pointerId: 1, button: 0 });
    await fireEvent.pointerMove(root, { clientX: 80, pointerId: 1 });
    await fireEvent.pointerMove(root, { clientX: 90, pointerId: 1 });
    expect(props[setter]).not.toHaveBeenCalled();

    await fireEvent.pointerUp(root, { clientX: 90, pointerId: 1 });
    expect(props[setter]).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['advanced.maxTokens', 'maxTokens', 1000, 2048],
    ['advanced.temperature', 'temperature', 0.33, 0.2],
  ] as const)(
    'a %s off the step grid still follows a later stored change',
    async (setting, key, offGrid, next) => {
      const props = makeGenerationSectionProps({
        caps: CLASSIC_CAPS,
        s: { advanced: { ...DEFAULT_SETTINGS.advanced, [key]: offGrid } },
      });
      const { container, rerender } = render(GenerationSection, { props });
      const thumb = (): string | null | undefined =>
        container
          .querySelector(`[data-ega-setting="${setting}"] [role="slider"]`)
          ?.getAttribute('aria-valuenow');
      await rerender({
        ...props,
        s: { ...props.s, advanced: { ...props.s.advanced, [key]: next } },
      });
      await waitFor(() => expect(Number(thumb())).toBe(next));
    },
  );

  it('does NOT render the defaultTone Select (TasksTonesSection owns it)', () => {
    const { container } = render(GenerationSection, { props: makeGenerationSectionProps() });
    expect(container.querySelector('[data-ega-setting="defaults.defaultTone"]')).toBeNull();
    expect(container.querySelector('#adv-tone')).toBeNull();
  });

  it('help text shows the real defaults from DEFAULT_SETTINGS, not stale literals', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({ caps: CLASSIC_CAPS }),
    });
    const tempWrap = container.querySelector('[data-ega-setting="advanced.temperature"]');
    const maxWrap = container.querySelector('[data-ega-setting="advanced.maxTokens"]');
    expect(tempWrap?.textContent).toContain(`Default ${DEFAULT_SETTINGS.advanced.temperature}`);
    expect(maxWrap?.textContent).toContain(`Default ${DEFAULT_SETTINGS.advanced.maxTokens}`);
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
    const maxWrap = container.querySelector('[data-ega-setting="advanced.maxTokens"]');
    expect(maxWrap?.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  it('no per-field reset at defaults (temperature 0.2 must not read as modified)', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({ caps: CLASSIC_CAPS }),
    });
    expect(container.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  it('the Effort control offers all four levels, whatever the active model takes', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({ caps: CLASSIC_CAPS }),
    });
    const effort = container.querySelector('[data-ega-setting="advanced.effort"]');
    for (const level of ['off', 'low', 'medium', 'high']) {
      expect(effort?.querySelector(`[data-ega-effort-value="${level}"]`), level).not.toBeNull();
    }
    expect(effort?.querySelector('[role="radiogroup"][aria-label="Effort"]')).not.toBeNull();
  });

  describe('what the chosen level does on the backend that runs first', () => {
    it('a model with no effort setting says Effort does not change it', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: CLASSIC_CAPS, activeModel: 'gpt-4o-mini' }),
      });
      expect(note(container)).toBe(
        'gpt-4o-mini has no effort setting, so Effort does not change it.',
      );
    });

    it('a model without Off says which level runs instead', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({
          caps: REASONING_CAPS,
          activeModel: 'claude-sonnet-5-5',
          s: { advanced: { ...DEFAULT_SETTINGS.advanced, effort: 'off' } },
        }),
      });
      expect(note(container)).toBe('claude-sonnet-5-5 has no Off level, so it runs at Low.');
    });

    it('says nothing when the model takes the chosen level', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: OFF_CAPS, activeModel: 'gpt-6-luna' }),
      });
      expect(note(container)).toBe('');
    });

    it('native says the CLI runs at Low', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: NATIVE_CAPS, activeBackend: 'native' }),
      });
      expect(note(container)).toBe('The native CLI always runs at Low effort.');
    });
  });

  describe('native backend (no caps)', () => {
    it('temperature shows the native reason instead of a slider', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: NATIVE_CAPS, activeBackend: 'native' }),
      });
      const tempWrap = container.querySelector('[data-ega-setting="advanced.temperature"]');
      expect(tempWrap?.querySelector('.ega-slider')).toBeNull();
      expect(tempWrap?.textContent).toMatch(/native cli manages its own sampling/i);
    });

    it('max answer length disabled with the native note', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: NATIVE_CAPS, activeBackend: 'native' }),
      });
      const maxWrap = container.querySelector('[data-ega-setting="advanced.maxTokens"]');
      expect(maxWrap?.querySelector('.ega-slider.disabled')).not.toBeNull();
      expect(maxWrap?.textContent).toMatch(/native cli manages its own sampling/i);
    });
  });

  describe('reasoning model (effort caps)', () => {
    it('temperature shows the reasoning reason instead of a slider', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: REASONING_CAPS }),
      });
      const tempWrap = container.querySelector('[data-ega-setting="advanced.temperature"]');
      expect(tempWrap?.querySelector('.ega-slider')).toBeNull();
      expect(tempWrap?.textContent).toMatch(/this model does not take temperature. use effort/i);
    });

    it('a model with neither temperature nor effort says so, not that a CLI manages it', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({
          caps: { temperature: false, maxTokens: true, efforts: [] },
        }),
      });
      const tempWrap = container.querySelector('[data-ega-setting="advanced.temperature"]');
      expect(tempWrap?.textContent).toMatch(/this model does not take temperature./i);
      expect(tempWrap?.textContent).not.toMatch(/native cli/i);
    });

    it('max answer length stays enabled (reasoning still caps output)', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({ caps: REASONING_CAPS }),
      });
      expect(
        container.querySelector('[data-ega-setting="advanced.maxTokens"] .ega-slider.disabled'),
      ).toBeNull();
    });
  });

  describe('edits reach the setters', () => {
    it('Reset section puts Effort, answer length and temperature back to their defaults', async () => {
      const props = makeGenerationSectionProps({
        s: {
          advanced: {
            ...DEFAULT_SETTINGS.advanced,
            temperature: 1.1,
            maxTokens: 900,
            effort: 'high',
          },
        },
      });
      const { getByRole } = render(GenerationSection, { props });
      await fireEvent.click(getByRole('button', { name: 'Reset Generation section to defaults' }));
      await waitFor(() =>
        expect(props.onSetGlobalEffort).toHaveBeenCalledWith(DEFAULT_SETTINGS.advanced.effort),
      );
      expect(props.onSetGlobalMaxTokens).toHaveBeenCalledWith(DEFAULT_SETTINGS.advanced.maxTokens);
      expect(props.onSetGlobalTemperature).toHaveBeenCalledWith(
        DEFAULT_SETTINGS.advanced.temperature,
      );
    });

    it('a modified Effort alone lights the section reset', () => {
      const { getByRole } = render(GenerationSection, {
        props: makeGenerationSectionProps({
          s: { advanced: { ...DEFAULT_SETTINGS.advanced, effort: 'high' } },
        }),
      });
      expect(
        (getByRole('button', { name: 'Reset Generation section to defaults' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });

    it('picking an effort sends it to the global setter', async () => {
      const props = makeGenerationSectionProps({ caps: REASONING_CAPS });
      const { getByRole } = render(GenerationSection, { props });
      const global = getByRole('radiogroup', { name: 'Effort' });
      await fireEvent.click(within(global).getByRole('radio', { name: 'High' }));
      expect(props.onSetGlobalEffort).toHaveBeenCalledWith('high');
    });
  });
});
