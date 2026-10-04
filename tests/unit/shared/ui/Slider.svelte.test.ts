// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Slider from '@/shared/ui/Slider.svelte';

describe('Slider readout', () => {
  it('readout is the mono surface pill', () => {
    const { container } = render(Slider, {
      props: {
        label: 'X',
        value: 0.7,
        min: 0,
        max: 1,
        step: 0.05,
        format: 'percent',
        onchange: () => {},
      },
    });
    expect(container.querySelector('.readout')).toBeTruthy();
  });

  it('format="percent" stamps aria-valuetext on the thumb matching the visible readout', () => {
    const { container } = render(Slider, {
      props: {
        label: 'X',
        value: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
        format: 'percent',
        onchange: () => {},
      },
    });
    const thumb = container.querySelector('[role="slider"]');
    expect(thumb).toBeTruthy();
    expect(thumb?.getAttribute('aria-valuetext')).toBe('60%');
    const readout = container.querySelector('.readout');
    expect(readout?.textContent.trim()).toBe('60%');
  });

  it('format="decimal" with unit stamps aria-valuetext including the unit', () => {
    const { container } = render(Slider, {
      props: {
        label: 'X',
        value: 30,
        min: 0,
        max: 100,
        unit: ' s',
        onchange: () => {},
      },
    });
    const thumb = container.querySelector('[role="slider"]');
    expect(thumb?.getAttribute('aria-valuetext')).toBe('30 s');
  });

  it('describedById joins the slider thumb aria-describedby chain', () => {
    const { container } = render(Slider, {
      props: {
        label: 'X',
        value: 5,
        min: 0,
        max: 10,
        help: 'help text',
        describedById: 'ext-warn',
        onchange: () => {},
      },
    });
    const thumb = container.querySelector('[role="slider"]');
    const dby = thumb?.getAttribute('aria-describedby') ?? '';
    expect(dby.split(' ')).toContain('ext-warn');
  });
});

describe('Slider inline reset', () => {
  const base = { label: 'X', value: 5, min: 0, max: 10, onchange: () => {} };

  it('renders the reset button when onReset is set and modified is true', () => {
    const { container } = render(Slider, {
      props: { ...base, modified: true, onReset: () => {}, resetAriaLabel: 'Reset X' },
    });
    const btn = container.querySelector('[data-ega-reset-field]');
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute('aria-label')).toBe('Reset X');
  });

  it('does NOT render the reset button when not modified', () => {
    const { container } = render(Slider, {
      props: { ...base, modified: false, onReset: () => {} },
    });
    expect(container.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  it('does NOT render the reset button when disabled (even if modified)', () => {
    const { container } = render(Slider, {
      props: { ...base, modified: true, disabled: true, onReset: () => {} },
    });
    expect(container.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  it('does NOT render the reset button when onReset is absent', () => {
    const { container } = render(Slider, { props: { ...base, modified: true } });
    expect(container.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  it('fires onReset on click and exposes the inherited tooltip', async () => {
    const onReset = vi.fn();
    const { container } = render(Slider, {
      props: { ...base, modified: true, onReset, resetInheritedLabel: 'Default 0.2' },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-reset-field]');
    expect(btn?.getAttribute('data-tooltip')).toBe('Default 0.2');
    if (btn) await fireEvent.click(btn);
    expect(onReset).toHaveBeenCalledOnce();
  });
});
