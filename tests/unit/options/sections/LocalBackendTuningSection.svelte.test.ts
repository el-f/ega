// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import LocalBackendTuningSection from '@/options/components/sections/LocalBackendTuningSection.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

describe('LocalBackendTuningSection', () => {
  it('mounts with the local-backend timeout slider + applies pre-extraction testid', () => {
    const { container } = render(LocalBackendTuningSection, {
      props: {
        settings: DEFAULT_SETTINGS,
        onChange: () => {},
      },
    });
    const wrap = container.querySelector('[data-testid="local-backend-timeout-slider"]');
    expect(wrap).not.toBeNull();
    // Slider primitive replaces native <input type="range"> with bits-ui's
    // role="slider" thumb. The testid wrap still hosts the slider chrome.
    const thumb = (wrap as HTMLElement).querySelector('[role="slider"]');
    expect(thumb).not.toBeNull();
  });

  // A keyboard step is a release in itself; the pointer drag (not reproducible in jsdom) commits only on pointer-up.
  it('emits onChange on a keyboard step through the commit path', async () => {
    let captured: number | null = null;
    const { container } = render(LocalBackendTuningSection, {
      props: {
        settings: DEFAULT_SETTINGS,
        onChange: (v: number) => {
          captured = v;
        },
      },
    });
    const thumb = container.querySelector<HTMLElement>(
      '[data-testid="local-backend-timeout-slider"] [role="slider"]',
    );
    expect(thumb).not.toBeNull();
    if (thumb) {
      thumb.focus();
      await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    }
    expect(typeof captured).toBe('number');
  });
});

describe('LocalBackendTuningSection — seconds', () => {
  it('shows the timeout in seconds and still stores whole milliseconds', async () => {
    let captured: number | null = null;
    const { container } = render(LocalBackendTuningSection, {
      props: {
        settings: { ...DEFAULT_SETTINGS, localBackendTimeoutMs: 800 },
        onChange: (v: number) => {
          captured = v;
        },
      },
    });
    expect(container.textContent).toContain('0.8 s');
    const thumb = container.querySelector<HTMLElement>('[role="slider"]');
    if (!thumb) throw new Error('no slider thumb');
    thumb.focus();
    await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(captured).toBe(900);
  });
});
