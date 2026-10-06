// @vitest-environment jsdom
import type { ComponentProps } from 'svelte';
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import RoutingSection from '@/options/components/sections/RoutingSection.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

type Props = ComponentProps<typeof RoutingSection>;

function props(over: Partial<Settings> = {}): {
  s: Settings;
  onPatch: Mock<Props['onPatch']>;
  onPatchAdvanced: Mock<Props['onPatchAdvanced']>;
} {
  return {
    s: { ...DEFAULT_SETTINGS, ...over } as Settings,
    onPatch: vi.fn<Props['onPatch']>(),
    onPatchAdvanced: vi.fn<Props['onPatchAdvanced']>(),
  };
}

const ANCHORS = [
  'advanced.retryCount',
  'advanced.translateTimeoutMs',
  'advanced.imageTranslateTimeoutMs',
];

describe('RoutingSection', () => {
  it('renders the anchor the settings search deep-links to, for each knob', () => {
    const { container } = render(RoutingSection, { props: props() });
    for (const id of ANCHORS) {
      expect(
        container.querySelector(`[data-ega-setting="${id}"] [role="slider"]`),
        `${id} has no slider`,
      ).not.toBeNull();
    }
  });

  it('shows the stored timeouts in seconds, falling back to the shipped default', () => {
    const { container } = render(RoutingSection, {
      props: props({ translateTimeoutMs: 180_000 }),
    });
    const read = (id: string): string | null | undefined =>
      container
        .querySelector(`[data-ega-setting="${id}"] [role="slider"]`)
        ?.getAttribute('aria-valuenow');
    expect(read('advanced.translateTimeoutMs')).toBe('180');
    expect(read('advanced.imageTranslateTimeoutMs')).toBe('120');
    expect(read('advanced.retryCount')).toBe('1');
  });

  it('writes translateTimeoutMs back in milliseconds', async () => {
    const p = props();
    const { container } = render(RoutingSection, { props: p });
    const thumb = container.querySelector(
      '[data-ega-setting="advanced.translateTimeoutMs"] [role="slider"]',
    );
    expect(thumb).not.toBeNull();
    await fireEvent.keyDown(thumb as Element, { key: 'ArrowRight' });
    expect(p.onPatch).toHaveBeenCalledWith({ translateTimeoutMs: 70_000 });
  });

  it('writes the fallback depth under advanced', async () => {
    const p = props();
    const { container } = render(RoutingSection, { props: p });
    const thumb = container.querySelector(
      '[data-ega-setting="advanced.retryCount"] [role="slider"]',
    );
    await fireEvent.keyDown(thumb as Element, { key: 'ArrowRight' });
    expect(p.onPatchAdvanced).toHaveBeenCalledWith({ retryCount: 2 });
  });

  it('lights the modified dot only on a knob the user moved', () => {
    const { container } = render(RoutingSection, { props: props({ translateTimeoutMs: 90_000 }) });
    const dot = (id: string): Element | null =>
      container.querySelector(`[data-ega-setting="${id}"] [data-ega-modified="true"]`);
    expect(dot('advanced.translateTimeoutMs')).not.toBeNull();
    expect(dot('advanced.imageTranslateTimeoutMs')).toBeNull();
    expect(dot('advanced.retryCount')).toBeNull();
  });
});
