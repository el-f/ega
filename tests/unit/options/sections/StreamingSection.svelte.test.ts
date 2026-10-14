// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import StreamingSection from '@/options/components/sections/StreamingSection.svelte';
import { makeSectionProps, type OnPatch } from './_helpers';
import { parseSettings } from '@/shared/settings-schema';

describe('StreamingSection', () => {
  it('renders the streaming toggle', () => {
    const { container } = render(StreamingSection, { props: makeSectionProps() });
    expect(container.querySelector('[data-ega-setting="display.streaming"]')).not.toBeNull();
  });

  it('describes streaming for all surfaces, not just the tooltip', () => {
    const { container } = render(StreamingSection, { props: makeSectionProps() });
    expect(container.textContent).toContain('Show the answer while the model writes it');
    expect(container.textContent).not.toContain('to the tooltip');
  });

  it('keeps the streamingFlushMs slider on screen but off while streaming is off, and says why', () => {
    const { container, getByText } = render(StreamingSection, {
      props: makeSectionProps({ s: { streaming: false } }),
    });
    const thumb = container.querySelector(
      '[data-ega-setting="display.streamingFlushMs"] [role="slider"]',
    );
    expect(thumb?.getAttribute('aria-disabled')).toBe('true');
    const reason = getByText('Used only while streaming is on');
    expect(thumb?.getAttribute('aria-describedby')?.split(' ')).toContain(reason.id);
  });

  it('shows the streamingFlushMs slider when streaming is on', () => {
    const { container } = render(StreamingSection, {
      props: makeSectionProps({ s: { streaming: true } }),
    });
    expect(container.querySelector('[data-ega-setting="display.streamingFlushMs"]')).not.toBeNull();
  });

  it('fires onPatch when toggling streaming', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(StreamingSection, {
      props: makeSectionProps({ s: { streaming: true }, onPatch }),
    });
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) throw new Error('checkbox not rendered');
    await fireEvent.click(checkbox);
    expect(onPatch).toHaveBeenCalledWith({ streaming: false });
  });
});

// The streaming checkbox carries a "modified from default" dot when streaming
// is turned off (default is on), matching the Cache + Page-context checkboxes.
describe('StreamingSection — modified dot', () => {
  it('shows no modified dot when streaming is on (default)', () => {
    const s = parseSettings({ streaming: true });
    const { container } = render(StreamingSection, { props: { s, onPatch: () => {} } });
    const row = container.querySelector('[data-ega-setting="display.streaming"]');
    expect(row).toBeTruthy();
    expect(row?.querySelector('[data-ega-modified="true"]')).toBeFalsy();
  });

  it('shows the modified dot when streaming is off', () => {
    const s = parseSettings({ streaming: false });
    const { container } = render(StreamingSection, { props: { s, onPatch: () => {} } });
    const row = container.querySelector('[data-ega-setting="display.streaming"]');
    expect(row?.querySelector('[data-ega-modified="true"]')).toBeTruthy();
  });
});

describe('StreamingSection — cache', () => {
  it('renders the cacheEnabled toggle in the same card', () => {
    const { container } = render(StreamingSection, { props: makeSectionProps() });
    const card = container.querySelector('.ega-section-card');
    expect(card?.querySelector('[data-ega-setting="advanced.cacheEnabled"]')).not.toBeNull();
    expect(card?.querySelector('[data-ega-setting="display.streaming"]')).not.toBeNull();
  });

  it('fires onPatch when toggling cacheEnabled', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(StreamingSection, {
      props: makeSectionProps({ s: { cacheEnabled: true }, onPatch }),
    });
    const cb = container.querySelector<HTMLInputElement>('#cache-enabled-toggle');
    if (!cb) throw new Error('no cache-enabled checkbox');
    await fireEvent.click(cb);
    expect(onPatch).toHaveBeenCalledWith({ cacheEnabled: false });
  });
});
