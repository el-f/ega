// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TemplateVersionBanner from '@/options/components/TemplateVersionBanner.svelte';

describe('TemplateVersionBanner', () => {
  const noop = (): void => {};

  it('does not render when user template version equals current', () => {
    const { container } = render(TemplateVersionBanner, {
      props: {
        userVersion: 6,
        currentVersion: 6,
        acknowledgedVersion: 0,
        onKeepMine: noop,
        onShowDiff: noop,
        onUseNew: noop,
      },
    });
    expect(container.querySelector('[data-ega-tpl-version-banner]')).toBeNull();
  });

  it('renders when user template version is older AND not acknowledged', () => {
    const { getByText, container } = render(TemplateVersionBanner, {
      props: {
        userVersion: 5,
        currentVersion: 6,
        acknowledgedVersion: 0,
        onKeepMine: noop,
        onShowDiff: noop,
        onUseNew: noop,
      },
    });
    expect(container.querySelector('[data-ega-tpl-version-banner]')).not.toBeNull();
    expect(getByText('A newer built-in Translate prompt is available')).toBeTruthy();
  });

  it('does not render when acknowledged matches current', () => {
    const { container } = render(TemplateVersionBanner, {
      props: {
        userVersion: 5,
        currentVersion: 6,
        acknowledgedVersion: 6,
        onKeepMine: noop,
        onShowDiff: noop,
        onUseNew: noop,
      },
    });
    expect(container.querySelector('[data-ega-tpl-version-banner]')).toBeNull();
  });

  it('does not render when acknowledged exceeds current (corrupt storage tolerated)', () => {
    const { container } = render(TemplateVersionBanner, {
      props: {
        userVersion: 5,
        currentVersion: 6,
        acknowledgedVersion: 99,
        onKeepMine: noop,
        onShowDiff: noop,
        onUseNew: noop,
      },
    });
    expect(container.querySelector('[data-ega-tpl-version-banner]')).toBeNull();
  });

  it('treats undefined acknowledgement as 0', () => {
    const { container } = render(TemplateVersionBanner, {
      props: {
        userVersion: 5,
        currentVersion: 6,
        acknowledgedVersion: undefined,
        onKeepMine: noop,
        onShowDiff: noop,
        onUseNew: noop,
      },
    });
    expect(container.querySelector('[data-ega-tpl-version-banner]')).not.toBeNull();
  });

  it('Keep mine fires onKeepMine', async () => {
    const onKeepMine = vi.fn();
    const { getByRole } = render(TemplateVersionBanner, {
      props: {
        userVersion: 5,
        currentVersion: 6,
        acknowledgedVersion: 0,
        onKeepMine,
        onShowDiff: noop,
        onUseNew: noop,
      },
    });
    await fireEvent.click(getByRole('button', { name: /Keep mine/i }));
    expect(onKeepMine).toHaveBeenCalledOnce();
  });

  it('Show changes fires onShowDiff', async () => {
    const onShowDiff = vi.fn();
    const { getByRole } = render(TemplateVersionBanner, {
      props: {
        userVersion: 5,
        currentVersion: 6,
        acknowledgedVersion: 0,
        onKeepMine: noop,
        onShowDiff,
        onUseNew: noop,
      },
    });
    await fireEvent.click(getByRole('button', { name: 'Show changes' }));
    expect(onShowDiff).toHaveBeenCalledOnce();
  });

  it('Use the new prompt fires onUseNew', async () => {
    const onUseNew = vi.fn();
    const { getByRole } = render(TemplateVersionBanner, {
      props: {
        userVersion: 5,
        currentVersion: 6,
        acknowledgedVersion: 0,
        onKeepMine: noop,
        onShowDiff: noop,
        onUseNew,
      },
    });
    await fireEvent.click(getByRole('button', { name: 'Use the new prompt' }));
    expect(onUseNew).toHaveBeenCalledOnce();
  });
});
