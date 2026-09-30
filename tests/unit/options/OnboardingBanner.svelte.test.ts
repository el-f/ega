// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import OnboardingBanner from '@/options/components/OnboardingBanner.svelte';

describe('OnboardingBanner', () => {
  it('renders the two onboarding buttons (Gemini + dismiss)', () => {
    const { container } = render(OnboardingBanner, {
      props: {
        onChooseGemini: () => {},
        onDismiss: () => {},
      },
    });
    expect(container.querySelector('[data-ega-onboard="gemini"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-onboard="dismiss"]')).not.toBeNull();
  });

  it('fires onChooseGemini when the primary button is clicked', () => {
    const onGemini = vi.fn();
    const { container } = render(OnboardingBanner, {
      props: {
        onChooseGemini: onGemini,
        onDismiss: () => {},
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-onboard="gemini"]');
    if (!btn) throw new Error('gemini button missing');
    btn.click();
    expect(onGemini).toHaveBeenCalledOnce();
  });

  it('fires onDismiss when the ghost button is clicked', () => {
    const onDismiss = vi.fn();
    const { container } = render(OnboardingBanner, {
      props: {
        onChooseGemini: () => {},
        onDismiss,
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-onboard="dismiss"]');
    if (!btn) throw new Error('dismiss button missing');
    btn.click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders a region landmark with an accessible label', () => {
    const { container } = render(OnboardingBanner, {
      props: {
        onChooseGemini: () => {},
        onDismiss: () => {},
      },
    });
    const region = container.querySelector('[role="region"]');
    if (!region) throw new Error('region missing');
    expect(region.getAttribute('aria-label')).toContain('Ega');
  });
});
