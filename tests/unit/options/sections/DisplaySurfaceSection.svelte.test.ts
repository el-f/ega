// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import DisplaySurfaceSection from '@/options/components/sections/DisplaySurfaceSection.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { makeSectionProps, type OnPatch } from './_helpers';
import { parseSettings } from '@/shared/settings-schema';

describe('DisplaySurfaceSection', () => {
  it('shows TooltipKnobs (not InlineKnobs) when defaultDisplayMode is tooltip', () => {
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({ s: { defaultDisplayMode: 'tooltip' } }),
    });
    expect(container.querySelector('[data-ega-knobs="tooltip"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-knobs="inline"]')).toBeNull();
    expect(
      container.querySelector('[data-ega-setting="display.tooltipShowSource"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="display.tooltipDraggable"]')).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="display.imageTranslateSurface"]'),
    ).not.toBeNull();
  });

  it('shows InlineKnobs (not TooltipKnobs) when defaultDisplayMode is inline', () => {
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({ s: { defaultDisplayMode: 'inline' } }),
    });
    expect(container.querySelector('[data-ega-knobs="inline"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-knobs="tooltip"]')).toBeNull();
    expect(container.querySelector('#confidence-pill')).not.toBeNull();
    // tooltip-only knobs absent in inline mode
    expect(container.querySelector('[data-ega-setting="display.tooltipShowSource"]')).toBeNull();
    // imageTranslateSurface is a SHARED knob above the mode-fork — present in both modes
    expect(
      container.querySelector('[data-ega-setting="display.imageTranslateSurface"]'),
    ).not.toBeNull();
  });

  // Inline replace never draws a pill; the knobs govern the tooltip and the side panel in either mode.
  for (const mode of ['tooltip', 'inline'] as const) {
    it(`renders the confidence-pill knobs once, outside the ${mode} knob stack`, () => {
      const { container } = render(DisplaySurfaceSection, {
        props: makeSectionProps({ s: { defaultDisplayMode: mode, confidencePill: true } }),
      });
      for (const id of ['display.confidencePill', 'display.confidencePillThreshold']) {
        const rows = container.querySelectorAll(`[data-ega-setting="${id}"]`);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.closest('[data-ega-knobs]')).toBeNull();
      }
      const pillRow = container.querySelector('[data-ega-setting="display.confidencePill"]');
      expect(pillRow?.textContent).toContain('Confidence pill');
      expect(pillRow?.parentElement?.textContent).toContain('Tooltip and side panel');
    });
  }

  it('clicking the inline segment patches defaultDisplayMode to "inline"', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({ s: { defaultDisplayMode: 'tooltip' }, onPatch }),
    });
    const inlineBtn = container.querySelector<HTMLButtonElement>('[data-ega-mode="inline"]');
    if (!inlineBtn) throw new Error('inline segment missing');
    await fireEvent.click(inlineBtn);
    expect(onPatch).toHaveBeenCalledWith({ defaultDisplayMode: 'inline' });
  });

  it('clicking the active segment is a no-op (no patch fired)', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({ s: { defaultDisplayMode: 'tooltip' }, onPatch }),
    });
    const activeBtn = container.querySelector<HTMLButtonElement>('[data-ega-mode="tooltip"]');
    if (!activeBtn) throw new Error('tooltip segment missing');
    await fireEvent.click(activeBtn);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('card-as-radio: active card gets aria-checked=true + .active class', () => {
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({ s: { defaultDisplayMode: 'inline' } }),
    });
    const tooltipCard = container.querySelector<HTMLElement>('[data-ega-mode="tooltip"]');
    const inlineCard = container.querySelector<HTMLElement>('[data-ega-mode="inline"]');
    if (!tooltipCard || !inlineCard) throw new Error('card-as-radio buttons missing');
    // Inline mode active → inline card is checked + has .active; tooltip card is not
    expect(inlineCard.getAttribute('aria-checked')).toBe('true');
    expect(inlineCard.classList.contains('active')).toBe(true);
    expect(tooltipCard.getAttribute('aria-checked')).toBe('false');
    expect(tooltipCard.classList.contains('active')).toBe(false);
  });

  it('reset clears the pill and tooltip options, never the mode', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({
        s: {
          defaultDisplayMode: 'tooltip',
          tooltipShowSource: true,
          tooltipDraggable: true,
        },
        onPatch,
      }),
    });
    const resetBtn = container.querySelector<HTMLButtonElement>('[data-ega-section-reset]');
    if (!resetBtn) throw new Error('section-reset button missing (expected when knobs modified)');
    await fireEvent.click(resetBtn);
    expect(onPatch).toHaveBeenCalledTimes(1);
    const patch = onPatch.mock.calls[0]?.[0] as Record<string, unknown>;
    // Reset should NOT touch defaultDisplayMode — resetting the picked mode while
    // configuring it would be confusing UX.
    expect(patch).not.toHaveProperty('defaultDisplayMode');
    expect(patch).toHaveProperty('tooltipShowSource', false);
    expect(patch).toHaveProperty('tooltipDraggable', false);
  });

  it('in inline mode the reset still names and covers the tooltip options', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({
        s: { defaultDisplayMode: 'inline', tooltipDraggable: true },
        onPatch,
      }),
    });
    const resetBtn = container.querySelector<HTMLButtonElement>('[data-ega-section-reset]');
    if (!resetBtn) throw new Error('reset missing while a tooltip option is changed');
    expect(resetBtn.textContent).toContain('Reset pill and tooltip options');
    await fireEvent.click(resetBtn);
    expect(onPatch.mock.calls[0]?.[0]).toHaveProperty('tooltipDraggable', false);
  });

  it('does not render reset button when no tooltip knobs are modified', () => {
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({ s: { defaultDisplayMode: 'tooltip' } }),
    });
    expect(container.querySelector('[data-ega-section-reset]')).toBeNull();
  });

  it('tooltip knob shows the per-row modified dot when it diverges from default', () => {
    const def = DEFAULT_SETTINGS;
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({
        s: {
          defaultDisplayMode: 'tooltip',
          tooltipShowSource: !def.tooltipShowSource,
          tooltipDraggable: def.tooltipDraggable,
        },
      }),
    });
    const row = container.querySelector('[data-ega-setting="display.tooltipShowSource"]');
    if (!row) throw new Error('tooltipShowSource row missing');
    expect(row.querySelector('[data-ega-modified="true"]')).not.toBeNull();
    // A knob still at its default must NOT show the dot.
    const unchanged = container.querySelector('[data-ega-setting="display.tooltipDraggable"]');
    expect(unchanged?.querySelector('[data-ega-modified="true"]')).toBeNull();
  });

  it('tooltip knobs at defaults show no modified dot', () => {
    const { container } = render(DisplaySurfaceSection, {
      props: makeSectionProps({ s: { defaultDisplayMode: 'tooltip' } }),
    });
    for (const key of [
      'display.tooltipShowSource',
      'display.tooltipClickOutside',
      'display.tooltipDraggable',
    ]) {
      const row = container.querySelector(`[data-ega-setting="${key}"]`);
      expect(row?.querySelector('[data-ega-modified="true"]')).toBeNull();
    }
  });
});

// The threshold is a setting, not a score: a tinted pill would make the 0% default look like an error.
describe('DisplaySurfaceSection — confidence-threshold readout', () => {
  it('renders the threshold as a neutral percent readout', () => {
    const s = parseSettings({ defaultDisplayMode: 'inline', confidencePill: true });
    const { container } = render(DisplaySurfaceSection, { props: { s, onPatch: () => {} } });

    const thresholdRow = container.querySelector(
      '[data-ega-setting="display.confidencePillThreshold"]',
    );
    expect(thresholdRow).toBeTruthy();

    const readout = thresholdRow?.querySelector('.readout');
    expect(readout).toBeTruthy();
    expect((readout?.textContent ?? '').trim()).toBe('0%');
  });
});

describe('DisplaySurfaceSection — radiogroup keyboard nav', () => {
  it('checked radio has tabindex=0; unchecked has tabindex=-1', () => {
    const s = parseSettings({ defaultDisplayMode: 'tooltip' });
    const { container } = render(DisplaySurfaceSection, { props: { s, onPatch: () => {} } });
    const tooltip = container.querySelector('[data-ega-mode="tooltip"]');
    const inline = container.querySelector('[data-ega-mode="inline"]');
    expect(tooltip?.getAttribute('tabindex')).toBe('0');
    expect(inline?.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight on radiogroup fires onPatch with the next mode', async () => {
    const onPatch = vi.fn<OnPatch>().mockResolvedValue(undefined);
    const s = parseSettings({ defaultDisplayMode: 'tooltip' });
    const { container } = render(DisplaySurfaceSection, { props: { s, onPatch } });
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    await fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onPatch).toHaveBeenCalledWith({ defaultDisplayMode: 'inline' });
  });

  it('ArrowLeft on radiogroup fires onPatch with the previous mode (wraps)', async () => {
    const onPatch = vi.fn<OnPatch>().mockResolvedValue(undefined);
    const s = parseSettings({ defaultDisplayMode: 'tooltip' });
    const { container } = render(DisplaySurfaceSection, { props: { s, onPatch } });
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    await fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onPatch).toHaveBeenCalledWith({ defaultDisplayMode: 'inline' });
  });
});

// Both controls show the modified dot when they differ from the default (pill on, surface 'sidepanel').
describe('DisplaySurfaceSection — modified dots', () => {
  it('no confidence-pill dot at default, dot when toggled off', () => {
    const def = render(DisplaySurfaceSection, {
      props: {
        s: parseSettings({ defaultDisplayMode: 'inline', confidencePill: true }),
        onPatch: () => {},
      },
    });
    const defRow = def.container.querySelector('[data-ega-setting="display.confidencePill"]');
    expect(defRow?.querySelector('[data-ega-modified="true"]')).toBeFalsy();

    const off = render(DisplaySurfaceSection, {
      props: {
        s: parseSettings({ defaultDisplayMode: 'inline', confidencePill: false }),
        onPatch: () => {},
      },
    });
    const offRow = off.container.querySelector('[data-ega-setting="display.confidencePill"]');
    expect(offRow?.querySelector('[data-ega-modified="true"]')).toBeTruthy();
  });

  it('no image-surface dot at default, dot when changed', () => {
    expect(DEFAULT_SETTINGS.imageTranslateSurface).toBe('sidepanel');
    const def = render(DisplaySurfaceSection, {
      props: { s: parseSettings({ imageTranslateSurface: 'sidepanel' }), onPatch: () => {} },
    });
    const defRow = def.container.querySelector(
      '[data-ega-setting="display.imageTranslateSurface"]',
    );
    expect(defRow?.querySelector('[data-ega-modified="true"]')).toBeFalsy();

    const changed = render(DisplaySurfaceSection, {
      props: { s: parseSettings({ imageTranslateSurface: 'tooltip' }), onPatch: () => {} },
    });
    const changedRow = changed.container.querySelector(
      '[data-ega-setting="display.imageTranslateSurface"]',
    );
    expect(changedRow?.querySelector('[data-ega-modified="true"]')).toBeTruthy();
  });

  describe('each knob patches its own settings key', () => {
    const knobs: Array<[string, keyof typeof DEFAULT_SETTINGS]> = [
      ['#tooltip-show-source', 'tooltipShowSource'],
      ['#tooltip-click-outside', 'tooltipClickOutside'],
      ['#tooltip-draggable', 'tooltipDraggable'],
      ['#confidence-pill', 'confidencePill'],
    ];

    for (const [selector, key] of knobs) {
      it(`${selector} patches ${key}, and nothing else`, async () => {
        const onPatch = vi.fn<OnPatch>();
        const { container } = render(DisplaySurfaceSection, {
          props: makeSectionProps({
            s: { defaultDisplayMode: 'tooltip', [key]: true },
            onPatch,
          }),
        });
        const box = container.querySelector<HTMLInputElement>(selector);
        if (!box) throw new Error(`${selector} missing`);

        await fireEvent.click(box);

        expect(onPatch).toHaveBeenCalledTimes(1);
        expect(onPatch).toHaveBeenCalledWith({ [key]: false });
      });
    }

    it('the confidence-pill knob under inline mode patches the same key', async () => {
      const onPatch = vi.fn<OnPatch>();
      const { container } = render(DisplaySurfaceSection, {
        props: makeSectionProps({
          s: { defaultDisplayMode: 'inline', confidencePill: false },
          onPatch,
        }),
      });
      const box = container.querySelector<HTMLInputElement>('#confidence-pill');
      if (!box) throw new Error('#confidence-pill missing');

      await fireEvent.click(box);

      expect(onPatch).toHaveBeenCalledWith({ confidencePill: true });
    });
  });
});
