// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/svelte';
import GenerationSection from '@/options/components/sections/GenerationSection.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { settingHint } from '@/shared/settings-registry';
import { makeGenerationSectionProps } from './_helpers';

describe('GenerationSection', () => {
  it('is one card: Effort, Longest answer and Creativity, each with its one-line hint', () => {
    const { container, getByRole } = render(GenerationSection, {
      props: makeGenerationSectionProps(),
    });
    expect(getByRole('heading', { name: 'Generation' })).toBeTruthy();
    for (const id of ['advanced.effort', 'advanced.maxTokens', 'advanced.temperature']) {
      const row = container.querySelector(`[data-ega-setting="${id}"]`);
      expect(row?.querySelector('[data-ega-hint]')?.textContent.trim(), id).toBe(settingHint(id));
    }
    expect(container.textContent).toContain('Longest answer');
    expect(container.textContent).toContain('Creativity (temperature)');
    expect(container.querySelector('[data-ega-setting="defaults.defaultTone"]')).toBeNull();
  });

  it('a second press before the first write lands starts from the released value', async () => {
    // The write settles only when the test says so, as a slow storage write would.
    const pending: (() => void)[] = [];
    const onSetGlobalMaxTokens = vi.fn(() => new Promise<void>((resolve) => pending.push(resolve)));
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({ onSetGlobalMaxTokens }),
    });
    const thumb = container.querySelector<HTMLElement>(
      '[data-ega-setting="advanced.maxTokens"] [role="slider"]',
    ) as HTMLElement;
    thumb.focus();
    for (let i = 0; i < 2; i++) {
      await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      await fireEvent.keyUp(thumb, { key: 'ArrowRight' });
    }
    expect(onSetGlobalMaxTokens).toHaveBeenLastCalledWith(DEFAULT_SETTINGS.advanced.maxTokens + 32);
    pending.forEach((resolve) => resolve());
  });

  it('shows the answer length with a thousands separator and "tokens"', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({
        s: { advanced: { ...DEFAULT_SETTINGS.advanced, maxTokens: 2048 } },
      }),
    });
    const thumb = container.querySelector(
      '[data-ega-setting="advanced.maxTokens"] [role="slider"]',
    );
    expect(thumb?.getAttribute('aria-valuetext')).toBe('2,048 tokens');
  });

  it('the Effort control offers all four levels, whatever backend runs', () => {
    const { container } = render(GenerationSection, { props: makeGenerationSectionProps() });
    const effort = container.querySelector('[data-ega-setting="advanced.effort"]');
    for (const level of ['off', 'low', 'medium', 'high']) {
      expect(effort?.querySelector(`[data-ega-effort-value="${level}"]`), level).not.toBeNull();
    }
  });

  it('renders each note line under its control, and never disables a control', () => {
    const { container } = render(GenerationSection, {
      props: makeGenerationSectionProps({
        notes: {
          effort: ['The native host always runs at Low'],
          maxTokens: ['The native host ignores this'],
          temperature: ['The native host and OpenAI ignore this'],
        },
      }),
    });
    const under = (id: string): string =>
      container
        .querySelector(`[data-ega-setting="${id}"] [data-ega-generation-note]`)
        ?.textContent.trim() ?? '';
    expect(under('advanced.effort')).toBe('The native host always runs at Low');
    expect(under('advanced.maxTokens')).toBe('The native host ignores this');
    expect(under('advanced.temperature')).toBe('The native host and OpenAI ignore this');
    expect(container.querySelector('.ega-slider.disabled')).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it('no per-field Changed marker at defaults (temperature 0.2 must not read as changed)', () => {
    const { container } = render(GenerationSection, { props: makeGenerationSectionProps() });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeNull();
    expect(container.querySelector('[data-ega-section-reset]')).toBeNull();
  });

  describe('edits', () => {
    it('Reset section asks the tab to reset the card to the three defaults, with Undo', async () => {
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
      await fireEvent.click(getByRole('button', { name: 'Reset section to defaults' }));
      expect(props.onResetCard).toHaveBeenCalledWith('Generation', {
        advanced: {
          temperature: DEFAULT_SETTINGS.advanced.temperature,
          maxTokens: DEFAULT_SETTINGS.advanced.maxTokens,
          effort: DEFAULT_SETTINGS.advanced.effort,
        },
      });
    });

    it('a changed Effort alone shows the section reset and the word Changed', () => {
      const { container } = render(GenerationSection, {
        props: makeGenerationSectionProps({
          s: { advanced: { ...DEFAULT_SETTINGS.advanced, effort: 'high' } },
        }),
      });
      expect(container.querySelector('[data-ega-section-reset]')).not.toBeNull();
      expect(
        container.querySelector('[data-ega-setting="advanced.effort"] [data-ega-modified]')
          ?.textContent,
      ).toBe('Changed');
    });

    it('picking an effort sends it to the global setter', async () => {
      const props = makeGenerationSectionProps();
      const { getByRole } = render(GenerationSection, { props });
      const global = getByRole('radiogroup', { name: 'Effort' });
      await fireEvent.click(within(global).getByRole('radio', { name: 'High' }));
      expect(props.onSetGlobalEffort).toHaveBeenCalledWith('high');
    });
  });
});
