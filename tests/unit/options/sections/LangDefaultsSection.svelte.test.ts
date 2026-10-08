// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import LangDefaultsSection from '@/options/components/sections/LangDefaultsSection.svelte';
import { toastStore } from '@/shared/components/toastStore';
import type { Settings } from '@/shared/types';
import { makeSectionProps } from './_helpers';

const sectionProps = (...a: Parameters<typeof makeSectionProps>) => ({
  varieties: [],
  ...makeSectionProps(...a),
});

vi.mock('@/shared/components/toastStore', () => ({
  toastStore: { push: vi.fn(), dismiss: vi.fn() },
}));

describe('LangDefaultsSection', () => {
  it('renders both language picker anchors', () => {
    const { container } = render(LangDefaultsSection, { props: sectionProps() });
    expect(container.querySelector('[data-ega-setting="defaults.defaultLang"]')).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="defaults.defaultTargetLang"]'),
    ).not.toBeNull();
  });

  it('swap button fires onPatch with source/target swapped', async () => {
    const onPatch = vi.fn();
    const { container } = render(LangDefaultsSection, {
      props: sectionProps({
        s: { defaultLang: 'en', defaultTargetLang: 'es' } as Partial<Settings>,
        onPatch,
      }),
    });
    const btn = container.querySelector<HTMLButtonElement>('button[aria-label="Swap languages"]');
    if (!btn) throw new Error('no swap button');
    await fireEvent.click(btn);
    expect(onPatch).toHaveBeenCalledWith({ defaultLang: 'es', defaultTargetLang: 'en' });
  });

  it('swap does nothing while the source is Auto-detect', async () => {
    const onPatch = vi.fn();
    const { container } = render(LangDefaultsSection, {
      props: sectionProps({
        s: { defaultLang: 'auto', defaultTargetLang: 'es' } as Partial<Settings>,
        onPatch,
      }),
    });
    const btn = container.querySelector<HTMLButtonElement>('button[aria-label="Swap languages"]');
    if (!btn) throw new Error('no swap button');
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(btn.getAttribute('aria-describedby') ?? '')?.textContent.trim(),
    ).toBe('Swap needs a source language, not Auto-detect');
    await fireEvent.click(btn);
    expect(onPatch).not.toHaveBeenCalled();
    // No tooltip trigger (bits-ui marks one with data-state): its open tooltip would replace the reason.
    expect(btn.hasAttribute('data-state')).toBe(false);
    expect(btn.getAttribute('aria-describedby')).toBe('lds-swap-why');
  });

  it('swap fires a polite toast announcement (focus stays on the button)', async () => {
    const push = vi.mocked(toastStore.push);
    push.mockClear();
    const { container } = render(LangDefaultsSection, {
      props: sectionProps({ s: { defaultLang: 'en' } as Partial<Settings> }),
    });
    const btn = container.querySelector<HTMLButtonElement>('button[aria-label="Swap languages"]');
    if (!btn) throw new Error('no swap button');
    await fireEvent.click(btn);
    expect(push).toHaveBeenCalledTimes(1);
    const call = push.mock.calls[0]?.[0];
    expect(call?.message).toMatch(/swap/i);
    expect(call?.variant).toBe('success');
  });
});
