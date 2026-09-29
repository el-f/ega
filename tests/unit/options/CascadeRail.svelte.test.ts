// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import CascadeRail from '@/options/components/CascadeRail.svelte';
import { DEFAULT_SETTINGS, DEFAULT_PROMPT_TEMPLATE } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

function makeProps(
  s: Settings,
  chip: 'global' | 'reword',
): Parameters<typeof render<typeof CascadeRail>>[1] {
  return { props: { s, chip } };
}

describe('CascadeRail', () => {
  it('renders two layer pills when chip=global (global + per-preset)', () => {
    const { container } = render(CascadeRail, makeProps(DEFAULT_SETTINGS, 'global'));
    expect(container.querySelector('[data-ega-cascade-layer="global"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-cascade-layer="per-task"]')).toBeNull();
    expect(container.querySelector('[data-ega-cascade-layer="per-preset"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-cascade-layer="per-site"]')).toBeNull();
    expect(container.querySelectorAll('[data-ega-cascade-layer]').length).toBe(2);
  });

  it('renders three pills when chip is a task (global + per-task + per-preset)', () => {
    const { container } = render(CascadeRail, makeProps(DEFAULT_SETTINGS, 'reword'));
    expect(container.querySelector('[data-ega-cascade-layer="per-task"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-cascade-layer="per-site"]')).toBeNull();
    expect(container.querySelectorAll('[data-ega-cascade-layer]').length).toBe(3);
  });

  it('global pill carries the `customised` class when promptTemplate diverges', () => {
    const modified: Settings = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        promptTemplate: { ...DEFAULT_PROMPT_TEMPLATE, system: 'custom system prompt' },
      },
    };
    const { container } = render(CascadeRail, makeProps(modified, 'reword'));
    const gl = container.querySelector('[data-ega-cascade-layer="global"]') as HTMLButtonElement;
    expect(gl.classList.contains('customised')).toBe(true);
  });

  it('onJumpToLayer passes the originating chip as fromChip', async () => {
    const onJumpToLayer = vi.fn();
    const { container } = render(CascadeRail, {
      props: { s: DEFAULT_SETTINGS, chip: 'reword' as const, onJumpToLayer },
    });
    const perPreset = container.querySelector(
      '[data-ega-cascade-layer="per-preset"]',
    ) as HTMLButtonElement;
    await fireEvent.click(perPreset);
    expect(onJumpToLayer).toHaveBeenCalledWith('per-preset', 'reword');
  });

  it('per-task pill carries the `customised` class when a task override exists', () => {
    const modified: Settings = {
      ...DEFAULT_SETTINGS,
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        taskTemplates: { reword: { system: 'x', user: 'y' } },
      },
    };
    const { container } = render(CascadeRail, makeProps(modified, 'reword'));
    const pt = container.querySelector('[data-ega-cascade-layer="per-task"]') as HTMLButtonElement;
    expect(pt.classList.contains('customised')).toBe(true);
  });
});
